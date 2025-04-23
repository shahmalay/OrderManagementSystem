import PDFDocument from 'pdfkit';
import fs from 'fs';

function generateInvoice(data, outputPath) {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const headerImage = './bills/BillHeader.png';
    const qrCodeImage = './bills/BillFooter.png';

    doc.pipe(fs.createWriteStream(outputPath));

    // **✅ Background color applied ONLY in content area**
    const margin = 50;
    doc.save();
    doc.fillOpacity(0.5).rect(margin, margin, 500 , doc.page.height - 2 * margin).fill('#FAF5EF');
    doc.restore();

    // **Set text color back to black**
    doc.fillColor('black');

    // **Header Section**
    doc.image(headerImage, margin, 30, { width: 500 });
    doc.moveDown(6);

    // **✅ Fix: Invoice Details (Now moves down properly)**
    doc.fontSize(12);
    doc.text(`Invoice No: ${data.bill_id}`, { align: 'right' });
    doc.text(`Date: ${data.date}`, { align: 'right' });
    doc.moveDown(2); // Moves down properly now

    // **Customer & Order Details**
    doc.fontSize(14).text(`Customer: ${data.customerName}`, margin + 8);
    doc.text(`Vehicle No: ${data.vehicleNumber}`, margin + 8);
    doc.text(`Driver: ${data.driverName}`, margin + 8);
    doc.moveDown(2);

    // **Table Headers**
    let startY = doc.y; // Get current Y position dynamically
    doc.fillColor('black').fontSize(12).font('Helvetica-Bold');
    doc.text('ITEMS', margin + 5, startY);
    doc.text('QTY', 220, startY);
    doc.text('RATE', 270, startY);
    doc.text('SGST', 320, startY);
    doc.text('CGST', 370, startY);
    doc.text('TOTAL', 440, startY);

    doc.font('Helvetica').fillColor('black');

    // **Items**
    let yPosition = startY + 30;
    data.items.forEach((item) => {
        doc.text(item.name, margin + 8, yPosition);
        doc.text(item.qty.toString(), 220, yPosition);
        doc.text(`${item.rate}`, 270, yPosition);
        doc.text(`${item.sgst}`, 320, yPosition);
        doc.text(`${item.cgst}`, 370, yPosition);
        doc.text(`${item.total}`, 440, yPosition);
        yPosition += 25;
    });

    // **Grand Total**
    doc.moveDown(2);
    doc.font('Helvetica-Bold').text(`Grand Total: ${data.grandTotal}`, { align: 'left' });

    // **✅ Footer Image (QR Code)**
    doc.image(qrCodeImage, margin, doc.page.height - 125, { width: 500 });

    doc.end();
}

const invoiceData = {
    bill_id: '12345',
    date: '2024-02-08',
    customerName: 'ABC Traders',
    vehicleNumber: 'GJ05AB1234',
    driverName: 'John Doe',
    grandTotal: '5000',
    items: [
        { name: 'Basmati Rice', qty: 10, rate: 100, sgst: 5, cgst: 5, total: 1050 },
        { name: 'Wheat Flour', qty: 5, rate: 50, sgst: 2.5, cgst: 2.5, total: 525 }
    ]
};

generateInvoice(invoiceData, './bills/invoice.pdf');
