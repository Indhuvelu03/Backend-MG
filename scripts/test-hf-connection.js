import dns from 'dns';
import axios from 'axios';
import https from 'https';
import { env } from '../config/env.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Force Node.js to use IPv4 first
dns.setDefaultResultOrder('ipv4first');



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testHuggingFaceConnection() {
  console.log('🧪 Testing Hugging Face API connection...');
  console.log(`   API Key: ${env.HUGGINGFACE_API_KEY ? '✅ Present' : '❌ Missing'}`);
  console.log(`   API Key length: ${env.HUGGINGFACE_API_KEY?.length || 0}`);
  
  // Test 1: Basic connection without SSL validation
  try {
    console.log('\n📡 Test 1: Basic connection...');
    const response = await axios.get('https://api-inference.huggingface.co/models', {
      timeout: 10000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Skip SSL validation for testing
      }),
      headers: {
        'Authorization': `Bearer ${env.HUGGINGFACE_API_KEY}`
      }
    });
    console.log('   ✅ Connection successful!');
    console.log(`   Status: ${response.status}`);
    console.log(`   Response size: ${JSON.stringify(response.data).length} bytes`);
  } catch (error) {
    console.error('   ❌ Connection failed:', error.message);
    console.error('   Code:', error.code);
    
    if (error.code === 'ENOTFOUND') {
      console.log('   🔍 DNS resolution failed');
    } else if (error.code === 'ECONNRESET') {
      console.log('   🔍 Connection reset - firewall might be blocking');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('   🔍 Connection timeout - network too slow');
    } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      console.log('   🔍 SSL certificate error');
    }
  }

  // Test 2: Ping the API
  try {
    console.log('\n📡 Test 2: Ping with minimal request...');
    const start = Date.now();
    const response = await axios.post('https://api-inference.huggingface.co/models/facebook/bart-large-cnn', {
      inputs: 'Test',
      parameters: { max_length: 10 }
    }, {
      timeout: 15000,
      headers: {
        'Authorization': `Bearer ${env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    const duration = Date.now() - start;
    console.log(`   ✅ API responded in ${duration}ms`);
    console.log(`   Status: ${response.status}`);
  } catch (error) {
    console.error('   ❌ API call failed:', error.message);
    if (error.response) {
      console.log(`   Response status: ${error.response.status}`);
      console.log(`   Response data:`, error.response.data);
    }
  }

  // Test 3: Check if port 443 is open
  console.log('\n📡 Test 3: Check network connectivity...');
  const net = await import('net');
  const socket = new net.Socket();
  
  socket.setTimeout(5000);
  socket.on('connect', () => {
    console.log('   ✅ Port 443 is reachable');
    socket.destroy();
  });
  socket.on('timeout', () => {
    console.log('   ❌ Port 443 connection timeout');
    socket.destroy();
  });
  socket.on('error', (err) => {
    console.log(`   ❌ Connection error: ${err.message}`);
    socket.destroy();
  });
  
  socket.connect(443, 'api-inference.huggingface.co');

  // Test 4: Check with curl alternative (using Node.js)
  console.log('\n📡 Test 4: Check if API is accessible (with SSL)...');
  try {
    const agent = new https.Agent({
      rejectUnauthorized: true
    });
    const req = https.request({
      hostname: 'api-inference.huggingface.co',
      port: 443,
      path: '/models',
      method: 'GET',
      agent: agent,
      headers: {
        'Authorization': `Bearer ${env.HUGGINGFACE_API_KEY}`
      }
    }, (res) => {
      console.log(`   ✅ SSL handshake successful!`);
      console.log(`   Status: ${res.statusCode}`);
      res.resume();
    });
    req.on('error', (err) => {
      console.error(`   ❌ SSL/Network error: ${err.message}`);
    });
    req.setTimeout(10000, () => {
      console.error('   ❌ Request timeout');
      req.destroy();
    });
    req.end();
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }
}

testHuggingFaceConnection();