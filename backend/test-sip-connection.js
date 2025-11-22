#!/usr/bin/env node
/**
 * Simple SIP Connection Test
 * Tests if our SIP server responds to INVITE requests
 */

const dgram = require('dgram');

const SIP_HOST = '127.0.0.1';
const SIP_PORT = 5060;

// Simple SIP INVITE message
const sipInvite = `INVITE sip:test@127.0.0.1 SIP/2.0
Via: SIP/2.0/UDP 127.0.0.1:5061;branch=z9hG4bK776asdhds
Max-Forwards: 70
To: <sip:test@127.0.0.1>
From: Test <sip:test@127.0.0.1>;tag=1928301774
Call-ID: test-call-${Date.now()}
CSeq: 314159 INVITE
Contact: <sip:test@127.0.0.1:5061>
Content-Type: application/sdp
Content-Length: 142

v=0
o=test 2890844526 2890844526 IN IP4 127.0.0.1
s=Test Session
c=IN IP4 127.0.0.1
t=0 0
m=audio 49170 RTP/AVP 0
a=rtpmap:0 PCMU/8000
`;

console.log('🧪 Testing SIP Server Connection...\n');
console.log(`Target: ${SIP_HOST}:${SIP_PORT}`);
console.log('Sending INVITE...\n');

const client = dgram.createSocket('udp4');

// Send INVITE
client.send(sipInvite, SIP_PORT, SIP_HOST, (err) => {
  if (err) {
    console.error('❌ Failed to send INVITE:', err);
    client.close();
    process.exit(1);
  }
  console.log('✅ INVITE sent');
});

// Listen for response
client.on('message', (msg, rinfo) => {
  console.log('\n📨 Received SIP response:');
  console.log('─'.repeat(60));
  console.log(msg.toString());
  console.log('─'.repeat(60));

  const response = msg.toString();

  if (response.includes('200 OK')) {
    console.log('\n✅ SUCCESS: SIP server responded with 200 OK');
    console.log('✅ Voice Agent is ready to accept calls!');
  } else if (response.includes('100 Trying')) {
    console.log('\n📞 SIP server is processing the call...');
    // Wait for final response
    return;
  } else {
    console.log('\n⚠️  Unexpected response');
  }

  client.close();
  process.exit(0);
});

client.on('error', (err) => {
  console.error('❌ Socket error:', err);
  client.close();
  process.exit(1);
});

// Timeout after 5 seconds
setTimeout(() => {
  console.log('\n⏱️  Timeout: No response from SIP server');
  console.log('Make sure the backend is running (npm run dev)');
  client.close();
  process.exit(1);
}, 5000);
