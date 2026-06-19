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
import Attendance from './pages/Attendance';
import Announcements from './pages/Announcements';
import QnA from './pages/QnA';
import Checkin from './pages/Checkin';
import CheckinQR from './pages/CheckinQR';
import Parent from './pages/Parent';
import './index.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/학부모" element={<Parent />} />
          <Route path="/*" element={
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/wordlists" element={<WordLists />} />
                <Route path="/wordlists/:id" element={<WordListDetail />} />
                <Route path="/test/:id" element={<Test />} />
                <Route path="/results" element={<Results />} />
                <Route path="/teacher" element={<TeacherLogin />} />
                <Route path="/students" element={<Students />} />
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/announcements" element={<Announcements />} />
                <Route path="/qna" element={<QnA />} />
                <Route path="/checkin" element={<Checkin />} />
                <Route path="/checkin-qr" element={<CheckinQR />} />
              </Routes>
            </Layout>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
