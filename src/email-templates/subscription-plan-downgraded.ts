/**
 * @description This file contains the email template for the plan downgraded email
 * @name planDowngradedEmail
 * @param {string} user_name - The name of the user
 * @param {string} email - The email of the user
 * @returns {Array} [emailTo, emailSubject, emailBody]
 */
export const subscriptionPlanDowngradedEmail = (
  user_name: string,
  email: string,
): [string, string, string] => {
  const emailTo = email;
  const emailSubject = 'Plan Downgraded | GrasprAI';

  // Get current year
  const year = new Date().getFullYear();

  // nicely formatted, beautiful email body html
  const emailBody = `
<!DOCTYPE html>
<html lang="en">

  <head>

    <meta charset="UTF-8" />

    <title>Plan Downgraded</title>

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

        <h1>Plan Downgraded To FREE</h1>

      </div>

      <div class="content">

        <p>Hi ${user_name},</p>

        <p>
          As you have reached the end of the billing cycle and your subscription was cancelled,
          you have been downgraded to the FREE plan.
          You will still have access to the documents you uploaded during the subscription.
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
