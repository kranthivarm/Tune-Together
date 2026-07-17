import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import HomeScreen from './components/HomeScreen';
import CreateRoomScreen from './components/CreateRoomScreen';
import JoinRoomScreen from './components/JoinRoomScreen';
import RoomScreen from './components/RoomScreen';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Router>
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/create" element={<CreateRoomScreen />} />
            <Route path="/join" element={<JoinRoomScreen />} />
            <Route path="/room" element={<RoomScreen />} />
          </Routes>
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
