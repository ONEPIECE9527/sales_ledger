import { spawn } from "child_process";
import path from "path";
import http from "http";

export interface OCRResult {
  customerName: string | null;
  date: string | null;
  address: string | null;
  productName: string | null;
  quantity: number | null;
  unit: string | null;
  orderNo: string | null;
  rawText: string;
}

const OCR_PORT = 7654;

// 模块级单例：服务进程 + 就绪状态
let serverReady = false;
let startPromise: Promise<void> | null = null;

function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${OCR_PORT}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function ensureServer(): Promise<void> {
  if (serverReady) return Promise.resolve();
  if (startPromise) return startPromise;

  startPromise = (async () => {
    // 先检查是否已有外部服务在跑
    if (await checkHealth()) {
      serverReady = true;
      return;
    }

    // 启动常驻服务进程
    const scriptPath = path.join(process.cwd(), "scripts", "ocr_server.py");
    const proc = spawn("python", [scriptPath, String(OCR_PORT)], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // 等待 Python 打印 OCR_SERVER_READY 信号（模型加载完成）
    await new Promise<void>((resolve, reject) => {
      let buf = "";
      const timer = setTimeout(
        () => reject(new Error("OCR server startup timeout (30s)")),
        30_000
      );

      proc.stdout!.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        if (buf.includes("OCR_SERVER_READY")) {
          clearTimeout(timer);
          resolve();
        }
      });

      proc.stderr!.on("data", () => {}); // 忽略 ONNX 警告

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (!serverReady) reject(new Error(`OCR server exited with code ${code}`));
      });
    });

    serverReady = true;
  })().catch((err) => {
    // 重置，允许下次重试
    startPromise = null;
    serverReady = false;
    throw err;
  });

  return startPromise;
}

function postOCR(imagePath: string): Promise<OCRResult> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ imagePath });
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: OCR_PORT,
        path: "/ocr",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const result = JSON.parse(data);
            if (result.error) reject(new Error(result.error));
            else resolve(result as OCRResult);
          } catch {
            reject(new Error(`Failed to parse OCR response: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function runOCR(imagePath: string): Promise<OCRResult> {
  await ensureServer();
  return postOCR(imagePath);
}
