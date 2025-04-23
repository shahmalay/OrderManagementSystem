import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, 
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS,
  },
});

function sendMail(to, sub, msg, path = null) {
  try {
    const mailOptions = {
      to: to,
      subject: sub,
      html: msg,
    };

    if (path) {
      mailOptions.attachments = [
        {
          filename: path.split('/').pop(),
          path: path,
        },
      ];
    }

    transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

export default sendMail;