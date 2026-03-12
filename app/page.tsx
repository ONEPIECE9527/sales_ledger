"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileSpreadsheet, Image, Loader2, Download, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";

type RecordItem = {
  sourceFileName: string;
  sourceType:
    | "delivery-order-excel"
    | "delivery-order-image"
    | "warehouse-shipping-excel"
    | "excel"
    | "image";
  customerName: string | null;
  date: string | null;
  deliveryProvince: string | null;
  productName: string | null;
  quantityRaw: number | null;
  quantityUnit: string | null;
  quantityNormalized: number | null;
  deliveryOrderNo: string | null;
  rawAddress: string | null;
  reviewRequired: boolean;
  errorMessage: string | null;
};

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editedResults, setEditedResults] = useState<RecordItem[]>([]);
  const [countdown, setCountdown] = useState(0);
  const autoParseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const filesRef = useRef<File[]>([]);

  filesRef.current = files;

  const activeResults = editedResults.length ? editedResults : results;

  const handleFileChange = (newFiles: FileList | null, isFolder = false) => {
    if (!newFiles) return;
    const arr = Array.from(newFiles).filter((f) =>
      /\.(xlsx|xls|jpg|jpeg|png)$/i.test(f.name)
    );
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...arr.filter((f) => !names.has(f.name))];
    });

    if (isFolder && arr.length > 0) {
      setCountdown(3);
      autoParseTimerRef.current = setTimeout(() => {
        handleParse();
      }, 3000);
    }
  };

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const cancelAutoParse = () => {
    if (autoParseTimerRef.current) {
      clearTimeout(autoParseTimerRef.current);
      autoParseTimerRef.current = null;
    }
    setCountdown(0);
  };

  async function pickFolder() {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: "read" });
      const arr: File[] = [];
      const readDir = async (handle: any): Promise<void> => {
        for await (const entry of handle.values()) {
          if (entry.kind === "file" && /\.(xlsx|xls|jpg|jpeg|png)$/i.test(entry.name)) {
            arr.push(await entry.getFile());
          } else if (entry.kind === "directory") {
            await readDir(entry);
          }
        }
      };
      await readDir(dirHandle);
      if (!arr.length) return;
      setFiles((prev) => {
        const names = new Set(prev.map((f) => f.name));
        return [...prev, ...arr.filter((f) => !names.has(f.name))];
      });
      setCountdown(3);
      autoParseTimerRef.current = setTimeout(() => handleParse(), 3000);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      alert("浏览器不支持文件夹选择，请直接拖拽文件夹到上传区域");
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileChange(e.dataTransfer.files);
  }, []);

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const clearAll = () => {
    setFiles([]);
    setResults([]);
    setEditedResults([]);
  };

  async function handleParse() {
    const currentFiles = filesRef.current;
    if (!currentFiles.length) return;
    setLoading(true);
    setResults([]);
    setEditedResults([]);
    setCountdown(0);

    const formData = new FormData();
    currentFiles.forEach((file) => formData.append("files", file));

    try {
      const res = await fetch("/api/parse", { method: "POST", body: formData });
      const json = await res.json();
      if (json.success) {
        setResults(json.data || []);
        setEditedResults(json.data || []);
      } else {
        alert("解析失败：" + (json.message || "未知错误"));
      }
    } catch (err) {
      alert("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!activeResults.length) return;

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: activeResults }),
      });

      if (!res.ok) {
        const json = await res.json();
        alert("导出失败：" + (json.message || "未知错误"));
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `销售台账输出_${today}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("导出时出错，请重试");
    }
  }

  const updateCell = (idx: number, field: keyof RecordItem, value: string) => {
    setEditedResults((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value || null };
      return copy;
    });
  };

  const reviewCount = activeResults.filter((r) => r.reviewRequired).length;
  const errorCount = activeResults.filter((r) => r.errorMessage).length;

  return (
    <main className="mx-auto max-w-7xl p-6 min-h-screen">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Lily-销售台账</h1>
        <p className="mt-1 text-sm text-gray-500">
          上传 Excel 或图片出库单，自动提取字段并导出标准销售台账
        </p>
      </div>

      {/* 上传区域 */}
      <div
        className={`border-2 border-dashed rounded-2xl p-8 mb-6 text-center transition-colors ${
          dragOver
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 bg-white"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className="mx-auto mb-3 text-gray-400" size={32} />
        <p className="text-gray-600 font-medium mb-1">拖拽文件到此处，或选择上传方式</p>
        <p className="text-gray-400 text-sm mb-4">支持 .xlsx .xls .jpg .jpeg .png</p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={pickFolder}
            className="flex items-center gap-2 rounded-xl px-5 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800"
          >
            选择文件夹
          </button>
          <button
            type="button"
            onClick={() => document.getElementById("file-input")?.click()}
            className="flex items-center gap-2 rounded-xl px-5 py-2 border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
          >
            选择文件
          </button>
        </div>
        <input
          id="file-input"
          type="file"
          multiple
          accept=".xlsx,.xls,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files)}
        />
      </div>

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="bg-white border rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-gray-700">已选文件（{files.length}）</span>
            <button
              onClick={clearAll}
              className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 size={14} /> 清空
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {files.map((f) => {
              const isExcel = /\.(xlsx|xls)$/i.test(f.name);
              return (
                <div
                  key={f.name}
                  className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-1.5 text-sm"
                >
                  {isExcel ? (
                    <FileSpreadsheet size={14} className="text-green-600" />
                  ) : (
                    <Image size={14} className="text-blue-600" />
                  )}
                  <span className="max-w-[200px] truncate text-gray-700">{f.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(f.name); }}
                    className="text-gray-400 hover:text-red-500 ml-1"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-3">
            {countdown > 0 ? (
              <>
                <span className="text-sm text-gray-500">
                  <Loader2 size={14} className="inline animate-spin mr-1" />
                  {countdown}s 后自动解析...
                </span>
                <button
                  onClick={cancelAutoParse}
                  className="rounded-xl px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50"
                >
                  终止
                </button>
              </>
            ) : (
              <button
                onClick={handleParse}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl px-5 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    解析中...
                  </>
                ) : (
                  "开始解析"
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 结果区域 */}
      {activeResults.length > 0 && (
        <div className="bg-white border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-gray-900">
                抽取结果（{activeResults.length} 条）
              </h2>
              {reviewCount > 0 && (
                <span className="flex items-center gap-1 text-amber-600 text-sm">
                  <AlertCircle size={14} />
                  {reviewCount} 条需复核
                </span>
              )}
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-red-600 text-sm">
                  <AlertCircle size={14} />
                  {errorCount} 条解析失败
                </span>
              )}
              {reviewCount === 0 && errorCount === 0 && (
                <span className="flex items-center gap-1 text-green-600 text-sm">
                  <CheckCircle2 size={14} />
                  全部解析成功
                </span>
              )}
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded-xl px-5 py-2 bg-green-600 text-white text-sm font-medium hover:bg-green-700"
            >
              <Download size={16} />
              导出标准台账
            </button>
          </div>

          <p className="text-xs text-gray-400 mb-3">点击单元格可直接修改内容</p>

          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">文件名</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">客户名称</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">时间</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">到货地址(省)</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">产品名称</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">申请数量(吨)</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">出库单号</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">状态</th>
                </tr>
              </thead>
              <tbody>
                {activeResults.map((item, idx) => (
                  <tr
                    key={idx}
                    className={
                      item.errorMessage
                        ? "bg-red-50"
                        : item.reviewRequired
                        ? "bg-amber-50"
                        : ""
                    }
                  >
                    <td className="border border-gray-200 px-3 py-2 text-gray-500 text-xs max-w-[160px] truncate whitespace-nowrap">
                      {item.sourceFileName}
                    </td>
                    <EditableCell
                      value={item.customerName || ""}
                      onChange={(v) => updateCell(idx, "customerName", v)}
                    />
                    <EditableCell
                      value={item.date || ""}
                      onChange={(v) => updateCell(idx, "date", v)}
                    />
                    <EditableCell
                      value={item.deliveryProvince || ""}
                      onChange={(v) => updateCell(idx, "deliveryProvince", v)}
                    />
                    <EditableCell
                      value={item.productName || ""}
                      onChange={(v) => updateCell(idx, "productName", v)}
                    />
                    <td className="border border-gray-200 px-3 py-2 text-right whitespace-nowrap">
                      {item.quantityNormalized != null
                        ? item.sourceType === "warehouse-shipping-excel"
                          ? item.quantityNormalized
                          : Number(item.quantityNormalized).toFixed(3)
                        : ""}
                      {item.quantityUnit && (
                        <span className="text-gray-400 text-xs ml-1">
                          ({item.quantityUnit})
                        </span>
                      )}
                    </td>
                    <EditableCell
                      value={item.deliveryOrderNo || ""}
                      onChange={(v) => updateCell(idx, "deliveryOrderNo", v)}
                    />
                    <td className="border border-gray-200 px-3 py-2 whitespace-nowrap">
                      {item.errorMessage ? (
                        <span className="text-red-500 text-xs" title={item.errorMessage}>
                          失败
                        </span>
                      ) : item.reviewRequired ? (
                        <span className="text-amber-500 text-xs">需复核</span>
                      ) : (
                        <span className="text-green-500 text-xs">✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

function EditableCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    setEditing(false);
    onChange(draft);
  };

  if (editing) {
    return (
      <td className="border border-blue-300 p-0">
        <input
          autoFocus
          className="w-full px-2 py-2 text-sm outline-none bg-blue-50"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
        />
      </td>
    );
  }

  return (
    <td
      className="border border-gray-200 px-3 py-2 cursor-pointer hover:bg-blue-50 whitespace-nowrap min-w-[80px]"
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      {value || <span className="text-gray-300 text-xs">—</span>}
    </td>
  );
}
