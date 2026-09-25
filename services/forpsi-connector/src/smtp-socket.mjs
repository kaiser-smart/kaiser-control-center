import { connect } from 'node:tls';

// Let the runtime resolve the hostname while establishing TLS. Nodemailer's DNS
// pre-resolution can pass an IP/CNAME as the TLS destination in Workers.
export function smtpSocketFactory(connectTls = connect, timeoutMs = 15000) {
  return (_options, callback) => {
    let socket, settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.removeListener('secureConnect', ready);
      if (error) { socket?.destroy(); callback(error); }
      else {
        // Nodemailer installs its listeners synchronously in this callback.
        callback(null, { connection: socket, secured: true });
        socket.removeListener('error', finish);
      }
    };
    const ready = () => finish(socket.authorized === true ? undefined :
      Object.assign(new Error('SMTP_TLS_UNAUTHORIZED'), { code:'ETLS' }));
    const timer = setTimeout(() => finish(Object.assign(new Error('SMTP_CONNECT_TIMEOUT'), {code:'ETIMEDOUT'})), timeoutMs);
    try {
      socket = connectTls({ host:'smtp.forpsi.com', port:465, servername:'smtp.forpsi.com',
        rejectUnauthorized:true, minVersion:'TLSv1.2' });
      socket.once('error', finish);
      socket.once('secureConnect', ready);
    } catch (error) { finish(error); }
  };
}
