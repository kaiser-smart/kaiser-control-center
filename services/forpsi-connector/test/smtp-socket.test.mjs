import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { smtpSocketFactory } from '../src/smtp-socket.mjs';

const socket = () => Object.assign(new EventEmitter(), {authorized:true, destroyed:false, destroy(){this.destroyed=true;}});
test('SMTP passes only an authenticated TLS socket to Nodemailer and ignores caller host overrides', () => {
  const s=socket(); let received, options, callbacks=0;
  smtpSocketFactory(o=>{options=o;return s;})({host:'attacker.example',port:25},(error,result)=>{assert.ifError(error);received=result;callbacks++;});
  assert.equal(callbacks,0);
  assert.deepEqual(options,{host:'smtp.forpsi.com',port:465,servername:'smtp.forpsi.com',rejectUnauthorized:true,minVersion:'TLSv1.2'});
  s.emit('secureConnect');
  assert.equal(callbacks,1);assert.equal(received.connection,s);assert.equal(received.secured,true);
  assert.equal(s.listenerCount('error'),0);
});
test('SMTP refuses unverified TLS, closes failed sockets and completes once', () => {
  for(const kind of ['certificate','connect']) {
    const s=socket(); let callbacks=0, code;
    smtpSocketFactory(()=>s)({},error=>{callbacks++;code=error.code;});
    if(kind==='certificate') {s.authorized=false;s.emit('secureConnect');} else s.emit('error',Object.assign(new Error('failure'),{code:'ECONNREFUSED'}));
    s.emit('secureConnect');
    assert.equal(callbacks,1);assert.equal(s.destroyed,true);assert.equal(code,kind==='certificate'?'ETLS':'ECONNREFUSED');
  }
});
test('SMTP connection timeout destroys the socket before auth; sync errors are returned', async () => {
  const s=socket();
  await new Promise(resolve=>smtpSocketFactory(()=>s,5)({},error=>{assert.equal(error.code,'ETIMEDOUT');assert.equal(s.destroyed,true);resolve();}));
  let callbacks=0;
  smtpSocketFactory(()=>{throw Object.assign(new Error('failure'),{code:'ESOCKET'});})({},error=>{callbacks++;assert.equal(error.code,'ESOCKET');});
  assert.equal(callbacks,1);
});
