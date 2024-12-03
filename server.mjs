// server.mjs

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import Joi from 'joi';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Shopify credentials from environment variables
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;

// Basic validation for environment variables
if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_URL) {
  console.error('Error: Missing required environment variables.');
  process.exit(1); // Exit the application
}

// Define input validation schema using Joi
const customerSchema = Joi.object({
  email: Joi.string().email().required(),
  firstName: Joi.string().optional(),
  lastName: Joi.string().optional(),
  phone: Joi.string().optional(),
  hearingLossLevel: Joi.string().optional(),
  averageVolume: Joi.number().optional(),
  wordRecognitionScore: Joi.number().optional(),
  wordsMissed: Joi.number().optional(),
});

// Helper function to introduce a delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.post('/addToShopify', async (req, res) => {
  // Validate input data
  const { error, value } = customerSchema.validate(req.body);

  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const {
    email,
    firstName,
    lastName,
    phone,
    hearingLossLevel,
    averageVolume,
    wordRecognitionScore,
    wordsMissed,
  } = value;

  // Validate phone number if provided
  if (phone) {
    const phoneNumber = parsePhoneNumberFromString(phone);
    if (!phoneNumber || !phoneNumber.isValid()) {
      return res
        .status(400)
        .json({ error: 'Enter a valid phone number in E.164 format' });
    }
  }

  // Prepare tags, including Hearing Loss Level if provided
  let tags = [];
  if (hearingLossLevel) {
    tags.push(`${hearingLossLevel}`);
  }

  // Convert tags array to a comma-separated string
  const tagsString = tags.join(', ');

  // Prepare Metafields for Hearing Loss Level
  let metafields = [];
  if (hearingLossLevel) {
    metafields.push({
      namespace: 'custom',
      key: 'hearing_loss_level',
      value: hearingLossLevel,
      type: 'single_line_text_field',
    });
  }

  // **Add Email and SMS Marketing Consents**
  const emailMarketingConsent = {
    state: 'subscribed', // Options: "subscribed", "not_subscribed", "pending"
    opt_in_level: 'single_opt_in', // Options: "single_opt_in", "confirmed_opt_in"
    consent_updated_at: new Date().toISOString(),
  };

  const smsMarketingConsent = {
    state: 'subscribed', // Options: "subscribed", "not_subscribed", "pending"
    opt_in_level: 'single_opt_in', // Options: "single_opt_in", "confirmed_opt_in"
    consent_updated_at: new Date().toISOString(),
    consent_collected_from: 'SHOPIFY', // Source of consent
  };

  const shopifyPayload = {
    customer: {
      email,
      first_name: firstName || '',
      last_name: lastName || '',
      phone: phone || '',
      verified_email: true,
      accepts_marketing: true,
      state: 'enabled', // Ensure the customer is active
      tags: tagsString, // Add tags if any
      metafields: metafields, // Add Metafields if any
      email_marketing_consent: emailMarketingConsent, // **Added Field**
      sms_marketing_consent: smsMarketingConsent, // **Added Field**
    },
  };

  // Log payload for debugging (avoid logging sensitive info)
  console.log('Shopify Payload:', JSON.stringify(shopifyPayload, null, 2));

  try {
    // Add customer to Shopify
    const shopifyResponse = await fetch(
      `https://${SHOPIFY_STORE_URL}/admin/api/2023-07/customers.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN, // Use access token for authentication
        },
        body: JSON.stringify(shopifyPayload),
      }
    );

    // Log API call limits for monitoring
    const apiCallLimit = shopifyResponse.headers.get(
      'X-Shopify-Shop-Api-Call-Limit'
    );
    if (apiCallLimit) {
      console.log(`Shopify API Call Limit: ${apiCallLimit}`);
    }

    if (!shopifyResponse.ok) {
      const errorData = await shopifyResponse.json();
      console.error('Error adding customer to Shopify:', errorData);
      return res.status(shopifyResponse.status).json({ error: errorData });
    }

    const shopifyData = await shopifyResponse.json();
    console.log('Shopify Response Data:', shopifyData);

    res.status(200).json({
      message: 'Customer added to Shopify successfully',
      data: shopifyData,
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.toString() });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
