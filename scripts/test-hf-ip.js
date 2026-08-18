// src/scripts/test-hf-ip.js
import axios from 'axios';
import https from 'https';
import { env } from '../config/env.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToUrl } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Replace with the IP from nslookup
const HF_IP = 'YOUR_IP_FROM_NSLOOKUP'; // e.g., '10.202.167.235'

async function testWithIP() {
  console.log('🧪 Testing Hugging Face API with IP directly...');
  console.log(`   IP: ${HF_IP}`);
  
  try {
    const response = await axios.post(
      `https://${HF_IP}/models/facebook/bart-large-cnn`,
      {
        inputs: 'Test',
        parameters: { max_length: 10 }
      },
      {
        httpsAgent: new https.Agent({
          rejectUnauthorized: false, // Skip SSL for testing
        }),
        headers: {
          'Authorization': `Bearer ${env.HUGGINGFACE_API_KEY}`,
          'Host': 'api-inference.huggingface.co',
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    console.log('✅ Success!');
    console.log(`   Status: ${response.status}`);
    console.log(`   Data:`, response.data);
  } catch (error) {
    console.error('❌ Failed:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
  }
}

testWithIP();