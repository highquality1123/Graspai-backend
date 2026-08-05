import * as nodemailer from 'nodemailer';

const nodeMailerEmail = process.env.NODEMAILER_EMAIL;
const nodeMailerPassword = process.env.NODEMAILER_PASSWORD;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: nodeMailerEmail,
    pass: nodeMailerPassword,
  },
});

export const sendEmail = async (
  toEmail: string,
  subject: string,
  body: string,
  callback: (error, info) => any,
) => {
  transporter.verify(function (error) {
    if (error) {
      console.log("Send email error", error);
    }
  });
  await transporter.sendMail(
    {
      from: nodeMailerEmail,
      to: toEmail,
      subject: subject,
      text: subject,
      html: body,
    },
    callback,
  );
};
