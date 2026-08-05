/**
 * @description This file contains the email template for the subscription cancelled email
 * @name subscriptionCancelledEmail
 * @param {string} user_name - The name of the user
 * @param {string} email - The email of the user
 * @returns {Array} [emailTo, emailSubject, emailBody]
 */
export const subscriptionCancelledEmail = (user_name: string, email: string): [string, string, string] => {
  const emailTo = email;
  const emailSubject = 'Subscription Cancelled | GrasprAI ';

  // Get current year
  const year = new Date().getFullYear();

  // nicely formatted, beautiful email body html
  const emailBody = `
<!DOCTYPE html>
<html lang="en">

  <head>

    <meta charset="UTF-8" />

    <title>Subscription Cancelled</title>

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

        <h1>Subscription Cancelled</h1>

      </div>

      <div class="content">

        <p>Hi ${user_name},</p>

        <p>
          Your subscription has been cancelled. At the end of your current billing cycle, your subscription will be downgraded to the FREE plan.
          You will still have access to all the features of the current subscription plan until the end of your billing cycle.
        </p>

        <p>
          If you have any questions or need assistance, please don't hesitate
          to contact us.
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
