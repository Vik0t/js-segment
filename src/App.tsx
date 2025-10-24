import './App.css'
import Segmentation from './components/Segmentation'

function App() {
  return (
    <div className="App" style={{ padding: 20 }}>
      <h1>Human Segmentation (RVM ONNX) — Demo</h1>
      <Segmentation />
    </div>
  )
}

export default App
