import Tesseract from "tesseract.js";

export async function runOCR(filePath: string): Promise<string> {
  const result = await Tesseract.recognize(filePath, "chi_sim+eng", {
    logger: () => {},
  });

  return result.data.text || "";
}
