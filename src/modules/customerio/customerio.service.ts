import { Injectable } from "@nestjs/common";

import axios from 'axios';

@Injectable()
export class CustomerioService {
  private baseUrl: string = 'https://track-eu.customer.io/api/v1';
  private siteId: string;
  private apiKey: string;
  private isEnabled: boolean;

  constructor() {
    this.isEnabled = process.env.CUSTOMERIO_ENABLED === 'true';
    this.siteId = process.env.CUSTOMERIO_SITE_ID;
    this.apiKey = process.env.CUSTOMERIO_API_KEY;
  }

  private getAuthHeader() {
    const token = Buffer.from(`${this.siteId}:${this.apiKey}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }

  public async identifyCustomer(customerId: string, customerData: object) {
    if (!this.isEnabled) return { message: "Customer.io integration is disabled." };

    const url = `${this.baseUrl}/customers/${customerId}`;
    try {
      const response = await axios.put(url, customerData, {
        headers: this.getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      //ignore this error - should not fail the main app
      console.error('Failed to identify customer, skipping this error:', error);
    }
  }
}
