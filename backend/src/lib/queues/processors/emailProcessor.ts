import { Job } from 'bull';
import { registerProcessor, JobType } from '../jobQueue';
import { logger } from '../../monitoring/logger';

/**
 * Email Job Processor
 * Handles all email sending asynchronously
 * Examples: receipts, notifications, alerts
 */

interface EmailJob {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  retryCount?: number;
}

async function emailProcessor(job: Job<EmailJob>) {
  const { to, subject, html } = job.data;

  try {
    logger.info({
      type: 'email_job_started',
      jobId: job.id,
      recipient: to,
      subject,
    });

    // TODO: Integrate with real email service
    // Examples: SendGrid, AWS SES, Mailgun
    // const result = await sendgridClient.send({
    //   to,
    //   from: process.env.SENDER_EMAIL,
    //   subject,
    //   html,
    // });

    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 500));

    logger.info({
      type: 'email_sent',
      jobId: job.id,
      recipient: to,
    });

    return {
      success: true,
      messageId: `msg_${Date.now()}`,
      recipient: to,
    };
  } catch (error: any) {
    logger.error({
      type: 'email_failed',
      jobId: job.id,
      error: error.message,
      recipient: to,
    });

    throw new Error(`Failed to send email to ${to}: ${error.message}`);
  }
}

// Register processor with 10 concurrent email jobs
registerProcessor(JobType.SEND_EMAIL, emailProcessor, 10);

export { emailProcessor };
