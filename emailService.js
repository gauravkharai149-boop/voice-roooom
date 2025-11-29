import nodemailer from 'nodemailer';

// Create a transporter using Ethereal (fake SMTP service) for testing
// In production, you would use Gmail, SendGrid, etc.
let transporter;

async function createTransporter() {
    if (transporter) return transporter;

    // Check if real credentials are provided
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && !process.env.EMAIL_USER.includes('your-email')) {
        console.log("Email Service: Using Real Gmail Account");
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    } else {
        console.log("Email Service: Using Ethereal (Fake) Account");
        // Generate test SMTP service account from ethereal.email
        const testAccount = await nodemailer.createTestAccount();

        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: testAccount.user, // generated ethereal user
                pass: testAccount.pass, // generated ethereal password
            },
        });
    }

    console.log("Email Service: Transporter created");
    return transporter;
}

async function sendVerificationEmail(email, code) {
    try {
        const transport = await createTransporter();

        const info = await transport.sendMail({
            from: '"Voice Room App" <noreply@voiceroom.com>', // sender address
            to: email, // list of receivers
            subject: "Verify your email", // Subject line
            text: `Your verification code is: ${code}`, // plain text body
            html: `<b>Your verification code is: ${code}</b>`, // html body
        });

        console.log("Message sent: %s", info.messageId);
        // Preview only available when sending through an Ethereal account
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));

        return true;
    } catch (error) {
        console.error("Error sending email:", error);
        return false;
    }
}

export { sendVerificationEmail };
