/**
 * @description This file contains the email template for the subscription success email
 * @name subscriptionSuccessEmail
 * @param {string} user_name - The name of the user
 * @param {string} email - The email of the user
 * @returns {Array} [emailTo, emailSubject, emailBody]
 */
export const subscriptionSuccessEmail = (
  user_name: string,
  email: string,
): [string, string, string] => {
  const emailTo = email;
  const emailSubject = 'Subscription Successful';

  // Get current year
  const year = new Date().getFullYear();

  // nicely formatted, beautiful email body html
  const emailBody = `
<!DOCTYPE html>
<html lang="en">

  <head>

    <meta charset="UTF-8" />

    <title>Subscription Successful</title>

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

        <h1>Subscription Successful</h1>

      </div>

      <div class="content">

        <p>Hi ${user_name},</p>

        <p>
          We are happy to inform you that your subscription was successful and your plan has been upgraded on GrasprAI.
        </p>

        <p>
          If you have any questions or need assistance, please don't hesitate
          to contact us.
        </p>

        <p>Thank you!</p>

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
