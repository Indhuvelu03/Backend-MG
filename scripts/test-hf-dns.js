// src/scripts/test-hf-dns.js
import dns from 'dns/promises';
import axios from 'axios';
import https from 'https';
import { env } from '../config/env.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function resolveAndTest() {
  console.log('🧪 Testing DNS resolution...');
  
  try {
    // Try all DNS methods
    console.log('\n📡 Method 1: dns.promises.resolve4');
    const addresses4 = await dns.resolve4('api-inference.huggingface.co');
    console.log(`   ✅ Found: ${addresses4.join(', ')}`);
    
    console.log('\n📡 Method 2: dns.promises.resolve6');
    try {
      const addresses6 = await dns.resolve6('api-inference.huggingface.co');
      console.log(`   ✅ Found IPv6: ${addresses6.join(', ')}`);
    } catch (e) {
      console.log(`   ℹ️ No IPv6 records`);
    }
    
    console.log('\n📡 Method 3: dns.promises.lookup');
    const lookupResult = await dns.lookup('api-inference.huggingface.co');
    console.log(`   ✅ Found: ${lookupResult.address} (family: ${lookupResult.family})`);
    
    // Use the resolved IP
    const ip = lookupResult.address;
    console.log(`\n📡 Using IP: ${ip}`);
    
    try {
      const response = await axios.post(
        `https://${ip}/models/facebook/bart-large-cnn`,
        {
          inputs: 'Test',
          parameters: { max_length: 10 }
        },
        {
          httpsAgent: new https.Agent({
            rejectUnauthorized: false,
          }),
          headers: {
            'Authorization': `Bearer ${env.HUGGINGFACE_API_KEY}`,
            'Host': 'api-inference.huggingface.co',
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      console.log('   ✅ API call successful!');
      console.log(`   Status: ${response.status}`);
    } catch (error) {
      console.error('   ❌ API call failed:', error.message);
    }
    
  } catch (error) {
    console.error('❌ DNS resolution failed:', error.message);
  }
}

resolveAndTest();