/**
 * @description This file contains the email template for the subscription payment failed email
 * @name subscriptionPaymentFailedEmail
 * @param {string} user_name - The name of the user
 * @param {string} email - The email of the user
 * @returns {Array} [emailTo, emailSubject, emailBody]
 */
export const subscriptionPaymentFailedEmail = (user_name: string, email: string): [string, string, string] => {
  const emailTo = email;
  const emailSubject = 'Payment Failed | GrasprAI ';

  // Get current year
  const year = new Date().getFullYear();

  // nicely formatted, beautiful email body html
  const emailBody = `
<!DOCTYPE html>
<html lang="en">

  <head>

    <meta charset="UTF-8" />

    <title>Payment Failed</title>

    <style>

      body {

        font-family: 'Arial', sans-serif;

        font-size: 16px;

        color: #333;

      }

      .container {

        width: 80%;

        margin: 0 auto;

      }

      .header {

        background-color: #f4f4f4;

        padding: 1rem;

        text-align: center;

      }

      .content {

        padding: 1rem;

      }

      .footer {

        background-color: #f4f4f4;

        padding: 1rem;

        text-align: center;

      }

    </style>

  </head>

  <body>

    <div class="container">

      <div class="header">

        <h1>Payment Failed</h1>

      </div>

      <div class="content">

        <p>Hi ${user_name},</p>

        <p>
          We're sorry to inform you that there was an issue processing your payment for the subscription renewal. As a result, your subscription has been suspended.
        </p>

        <p>
          Please update your payment information to reactivate your subscription and continue enjoying all the benefits of our subscription plan.
        </p>

        <p>
          If you have any questions or need assistance, please don't hesitate to contact us.
        </p>

        <p>Thank you</p>

      </div>

      <div class="footer">
        <p>&copy; ${year} GrasprAI</p>
      </div>

    </div>

  </body>

</html>
`;

  return [emailTo, emailSubject, emailBody];
};
