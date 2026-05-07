import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import WordLists from './pages/WordLists';
import WordListDetail from './pages/WordListDetail';
import Test from './pages/Test';
import Results from './pages/Results';
import TeacherLogin from './pages/TeacherLogin';
import Students from './pages/Students';
import './index.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/wordlists" element={<WordLists />} />
            <Route path="/wordlists/:id" element={<WordListDetail />} />
            <Route path="/test/:id" element={<Test />} />
            <Route path="/results" element={<Results />} />
            <Route path="/teacher" element={<TeacherLogin />} />
            <Route path="/students" element={<Students />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}
