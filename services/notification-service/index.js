const express = require("express");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "your@email.com",
    pass: "app-password"
  }
});

app.post("/send-email", async (req, res) => {
  const { to, message } = req.body;

  await transporter.sendMail({
    from: "CarTarShop",
    to,
    subject: "Order Confirmation",
    text: message
  });

  res.send("Email sent");
});

app.listen(3006);