const express = require("express");
const PDFDocument = require("pdfkit");

const app = express();

app.get("/invoice/:id", (req, res) => {
  const doc = new PDFDocument();
  doc.pipe(res);
  doc.text(`Invoice for order ${req.params.id}`);
  doc.end();
});

app.listen(3007);