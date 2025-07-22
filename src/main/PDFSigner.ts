import fs from 'fs';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFName,
  PDFNumber,
  PDFHexString,
  PDFString,
  PDFArray,
} from 'pdf-lib';
import signer from 'node-signpdf';

const SIGNATURE_LENGTH = 5540;

export class PDFSigner {
  private eSignText: string;
  private certificatePath: string;
  private password: string;

  constructor(eSignText: string, certificatePath: string, password: string) {
    this.eSignText = eSignText;
    this.certificatePath = certificatePath;
    this.password = password;
  }

  public async sign(filePath: string, outputFilePath: string): Promise<void> {
    const certificateBuffer = fs.readFileSync(this.certificatePath);

    try {
      const pdfBuffer = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(pdfBuffer, {
        ignoreEncryption: true,
      });

      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { height } = firstPage.getSize();

      firstPage.drawText(this.eSignText, {
        x: 1,
        y: height - 8,
        size: 8,
        font: helveticaFont,
        color: rgb(0.128, 0.128, 0.128),
      });

      pdfDoc.save({ useObjectStreams: false });

      const ByteRange = PDFArray.withContext(pdfDoc.context);
      ByteRange.push(PDFNumber.of(0));
      ByteRange.push(PDFName.of(signer.byteRangePlaceholder));
      ByteRange.push(PDFName.of(signer.byteRangePlaceholder));
      ByteRange.push(PDFName.of(signer.byteRangePlaceholder));

      const signatureDict = pdfDoc.context.obj({
        Type: 'Sig',
        Filter: 'Adobe.PPKLite',
        SubFilter: 'adbe.pkcs7.detached',
        ByteRange,
        Contents: PDFHexString.of('A'.repeat(SIGNATURE_LENGTH)),
        Reason: PDFString.of('Assinatura digital'),
        M: PDFString.fromDate(new Date()),
      });
      const signatureDictref = pdfDoc.context.register(signatureDict);

      const widgetDict = pdfDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Widget',
        FT: 'Sig',
        Rect: [0, 0, 0, 0],
        V: signatureDictref,
        T: PDFString.of('Assinatura digital'),
        F: 4,
        P: firstPage.ref,
      });
      const widgetDictRef = pdfDoc.context.register(widgetDict);

      firstPage.node.set(
        PDFName.of('Annots'),
        pdfDoc.context.obj([widgetDictRef]),
      );

      pdfDoc.catalog.set(
        PDFName.of('AcroForm'),
        pdfDoc.context.obj({
          SigFlags: PDFNumber.of(3),
          Fields: [widgetDictRef],
        }),
      );

      const modifiedPdfBytes = await pdfDoc.save({ useObjectStreams: false });
      const modifiedPdfBuffer = Buffer.from(modifiedPdfBytes);

      const signedPdfBuffer = signer.sign(
        modifiedPdfBuffer,
        certificateBuffer,
        {
          passphrase: this.password,
        },
      );

      fs.writeFileSync(outputFilePath, signedPdfBuffer);
    } catch (error: any) {
      const errorMessage = error.toString();

      if (errorMessage.includes('Invalid password')) {
        throw new Error('Invalid password');
      }

      if (errorMessage.includes('Invalid certificate')) {
        throw new Error('Invalid certificate');
      }

      if (errorMessage.includes('Invalid PDF')) {
        throw new Error('Invalid PDF');
      }

      if (errorMessage.includes('Invalid signature')) {
        throw new Error('Invalid signature');
      }

      if (errorMessage.includes('Invalid signature field')) {
        throw new Error('Invalid signature field');
      }

      console.error('Error signing PDF:', error);
      throw new Error(errorMessage);
    }
  }
}
