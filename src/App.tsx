import { Container } from 'react-bootstrap';
import './App.css'
import Programmer from './Programmer';

function App() {

  return (
    <Container>
      <h1>FTC Stacklight Programmer</h1>

      {!!window.navigator.serial ? <Programmer/> : <p>Web Serial not supported in this browser. Please try Chrome or Firefox.</p>}
    </Container>
  )
}

export default App
