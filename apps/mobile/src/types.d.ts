// Le cœur de `qrcode` (sans les rendus Node : fichiers, PNG) n'a pas de types publiés.
declare module "qrcode/lib/core/qrcode" {
  const QRCode: {
    create(
      text: string,
      options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H"; version?: number },
    ): { version: number; modules: { size: number; data: Uint8Array } };
  };
  export default QRCode;
}
