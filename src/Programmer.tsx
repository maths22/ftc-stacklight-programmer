import { Button, Form, Spinner, Table } from 'react-bootstrap';
import { useCallback, useEffect, useState } from 'react';

enum WifiSecurity {
  NONE = 0,
  WPA2 = 2,
  WPA2_ENTERPRISE = 3
}

type StackLightCommand = {
  action: 'ping' // TODO others that we need
} | {
  action: 'conf_wifi'
  ssid: string
  security: WifiSecurity
  user?: string
  password?: string
}

type StackLightCommands = StackLightCommand[];

interface StackLightInfo {
  id: string;
  device: string;
  version: string;
  ip?: string;
  ssid?: string;
}

type StackLightResponse = "r" | "u" | StackLightInfo

async function readWithTimeout(port: SerialPort, timeout: number) {
  const reader = port.readable!.getReader();
  const timer = setTimeout(() => {
    reader.releaseLock();
  }, timeout);
  let result: { done: boolean; value: Uint8Array | undefined } = {done: false, value: new Uint8Array()};
  try {
    result = await reader.read();
  }
  catch (e) {
    if (e instanceof TypeError) {
      return result.value
    }
    else {
      throw(e);
    }
  }
  clearTimeout(timer);
  reader.releaseLock();
  return result.value;
}

async function sendCommands(port: SerialPort, command: StackLightCommands): Promise<StackLightResponse[]> {
  await port.open({ baudRate: 9600 });
  try {
    if(!port.readable || !port.writable) {
      throw new Error('Port is not readable or writable');
    }
    const writer = port.writable.getWriter();
    await writer.write(new TextEncoder().encode(JSON.stringify(command) + "\n"));
    writer.releaseLock();
    let response = ''
    let value: Uint8Array | undefined = undefined;
    do {
      value = await readWithTimeout(port, 100);
      if(value) {
        response += new TextDecoder().decode(value);
      }
    } while(value && value.length > 0)
    const parsedResponse = JSON.parse(response)
    if(!(parsedResponse instanceof Array) || parsedResponse.length != command.length) {
      throw new Error('Invalid response from device');
    }
    return response ? parsedResponse : [];
  } finally {
    await port.close();
  }
}

async function getInfo(port: SerialPort): Promise<StackLightInfo | null> {
  const response = await sendCommands(port, [{ action: 'ping' }]);
  const info = response[0]
  if(!info || info === "r" || info === "u") {
    return null;
  }
  if(info['device'] !== 'ftcStack') {
    return null;
  }
  return info
}

export default function Programmer() {
  const [port, setPort] = useState<SerialPort>();
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<StackLightInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ssid, setSsid] = useState('');
  const [security, setSecurity] = useState(WifiSecurity.NONE);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  
  useEffect(() => {
    (async () => {
      if(!port) {
        setLoading(false);
        setInfo(null);
        return;
      }
      try {
      setLoading(true);
        const info = await getInfo(port);
        setInfo(info);
      } catch (err) {
        console.error('Failed to get info from serial port:', err);
        setError((err as Error).message);
        setInfo(null);
      } finally {
        setLoading(false);
      }
      const refreshInterval = setInterval(async () => {
        if(port) {
          const info = await getInfo(port);
          setInfo(info);
        }
      }, 5000);
      return () => clearInterval(refreshInterval);
    })();
  }, [port]);

  const connect = useCallback(async () => {
    try {
      setPort(await window.navigator.serial.requestPort());
    } catch (error) {
      console.error('Failed to connect to serial port:', error);
    }
  }, []);

  const updateWifi = useCallback(async () => {
    if(!port) {
      setError('No port connected');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendCommands(port, [{
        action: 'conf_wifi',
        ssid,
        security,
        user: security === WifiSecurity.WPA2_ENTERPRISE ? user : undefined,
        password: security !== WifiSecurity.NONE ? password : undefined
      }]);
    } catch (err) {
      console.error('Failed to update WiFi settings:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [port, ssid, security, user, password]);

  return (
    <div>
      <Button onClick={connect}>Connect to Device</Button>
      <br/>
      {loading ? <Spinner animation="border" /> : null}
      {error ? <p style={{ color: 'red' }}>{error}</p> : null}
      {info ? <>
        <Table>
          <tbody>
            <tr>
              <th>ID</th>
              <td>{info.id}</td>
            </tr>
            <tr>
              <th>Device</th>
              <td>{info.device}</td>
            </tr>
            <tr>
              <th>Version</th>
              <td>{info.version}</td>
            </tr>
            {info.ip && (
              <tr>
                <th>IP</th>
                <td>{info.ip}</td>
              </tr>
            )}
            {info.ssid && (
              <tr>
                <th>SSID</th>
                <td>{info.ssid}</td>
              </tr>
            )}
          </tbody>
        </Table>

        <Form>
          <Form.Group className="mb-3" controlId="ssid">
            <Form.Label>SSID</Form.Label>
            <Form.Control type="text" placeholder="Enter SSID" value={ssid} onChange={e => setSsid(e.target.value)} />
          </Form.Group>
          <Form.Group className="mb-3" controlId="security">
            <Form.Label>Security</Form.Label>
            <Form.Control as="select" value={security} onChange={e => setSecurity(Number(e.target.value))}>
              <option value={WifiSecurity.NONE}>None</option>
              <option value={WifiSecurity.WPA2}>WPA2</option>
              <option value={WifiSecurity.WPA2_ENTERPRISE}>WPA2 Enterprise</option>
            </Form.Control>
          </Form.Group>
          {security === WifiSecurity.WPA2_ENTERPRISE && (
            <Form.Group className="mb-3" controlId="user">
              <Form.Label>User</Form.Label>
              <Form.Control type="text" placeholder="Enter User" value={user} onChange={e => setUser(e.target.value)} />
            </Form.Group>
          )}

          {security !== WifiSecurity.NONE && (
            <Form.Group className="mb-3" controlId="password">
            <Form.Label>Password</Form.Label>
            <Form.Control type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          </Form.Group>
          )}
          <Button variant="primary" onClick={updateWifi}>
            Update
          </Button>
        </Form>
      </> : null}
    </div>
  )
}