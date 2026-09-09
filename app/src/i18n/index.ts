import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      appName: 'CivicLens',
      tagline: 'GIS Village Infrastructure Monitoring',
      auth: {
        login: 'Login',
        register: 'Register',
        phone: 'Phone Number',
        password: 'Password',
        name: 'Full Name',
        loginBtn: 'Log In',
        registerBtn: 'Create Account',
        switchToRegister: 'Need an account? Register',
        switchToLogin: 'Already have an account? Login',
        logout: 'Logout',
        error: 'Authentication failed',
        offlineMode: 'Continue in Offline Demo Mode',
        offlineNotice: 'Testing without a backend? Enter in offline mode.',
        serverUnreachable: 'Server unreachable. Enter in Offline Mode?',
        useOfflineNow: 'Continue Offline with this profile'
      },
      nav: {
        map: 'Map',
        report: 'Report',
        myReports: 'My Reports',
        quickAdd: 'Quick Add',
        analytics: 'Admin',
      },
      status: {
        saved: 'Saved on Phone',
        syncing: 'Syncing to Server...',
        submitted: 'Submitted',
        offline: 'Offline Mode',
        online: 'Connected',
        coldStart: 'Saved safely on phone. Connecting to Panchayat server...',
      },
      categories: {
        water: 'Water Supply',
        lighting: 'Street Lighting',
        sanitation: 'Public Sanitation',
        roads: 'Roads & Drains',
        health: 'Health (PHC)',
        education: 'School / Anganwadi',
      },
      actions: {
        reportIssue: 'Report Issue',
        addAsset: 'Add Village Asset',
        syncNow: 'Sync Outbox Now',
        printReport: 'Print Ward Report',
        takePhoto: 'Take Photo',
        compressing: 'Optimizing Photo...',
      },
    },
  },
  hi: {
    translation: {
      appName: 'सिविक लेंस',
      tagline: 'जीआईएस ग्राम पंचायत बुनियादी ढांचा निगरानी',
      auth: {
        login: 'लॉग इन करें',
        register: 'पंजीकरण करें',
        phone: 'फ़ोन नंबर',
        password: 'पासवर्ड',
        name: 'पूरा नाम',
        loginBtn: 'लॉग इन करें',
        registerBtn: 'खाता बनाएं',
        switchToRegister: 'खाता नहीं है? पंजीकरण करें',
        switchToLogin: 'पहले से खाता है? लॉग इन करें',
        logout: 'लॉग आउट',
        error: 'प्रमाणीकरण विफल',
        offlineMode: 'ऑफलाइन डेमो मोड में जारी रखें',
        offlineNotice: 'सर्वर के बिना परीक्षण कर रहे हैं? ऑफलाइन मोड में प्रवेश करें।',
        serverUnreachable: 'सर्वर उपलब्ध नहीं है। क्या आप ऑफलाइन मोड में जारी रखना चाहते हैं?',
        useOfflineNow: 'इस प्रोफ़ाइल के साथ ऑफलाइन जारी रखें'
      },
      nav: {
        map: 'मानचित्र',
        report: 'शिकायत दर्ज करें',
        myReports: 'मेरी शिकायतें',
        quickAdd: 'त्वरित जोड़ें',
        analytics: 'प्रशासन',
      },
      status: {
        saved: 'फोन पर सुरक्षित',
        syncing: 'सर्वर से सिंक हो रहा है...',
        submitted: 'जमा हो गया',
        offline: 'ऑफलाइन मोड',
        online: 'ऑनलाइन',
        coldStart: 'फोन पर सुरक्षित। पंचायत सर्वर से कनेक्ट हो रहा है...',
      },
      categories: {
        water: 'जल आपूर्ति',
        lighting: 'स्ट्रीट लाइट',
        sanitation: 'सफाई एवं शौचालय',
        roads: 'सड़क एवं नाली',
        health: 'स्वास्थ्य केंद्र (PHC)',
        education: 'स्कूल / आंगनवाड़ी',
      },
      actions: {
        reportIssue: 'समस्या की रिपोर्ट करें',
        addAsset: 'ग्राम संपत्ति जोड़ें',
        syncNow: 'अभी सिंक करें',
        printReport: 'रिपोर्ट प्रिंट करें',
        takePhoto: 'फोटो खींचें',
        compressing: 'फोटो ऑप्टिमाइज़ हो रही है...',
      },
    },
  },
  mr: {
    translation: {
      appName: 'सिव्हिक लेन्स',
      tagline: 'जीआयएस ग्रामपंचायत पायाभूत सुविधा देखरेख',
      auth: {
        login: 'लॉगिन करा',
        register: 'नोंदणी करा',
        phone: 'फोन नंबर',
        password: 'पासवर्ड',
        name: 'पूर्ण नाव',
        loginBtn: 'लॉगिन करा',
        registerBtn: 'खाते तयार करा',
        switchToRegister: 'खाते नाही? नोंदणी करा',
        switchToLogin: 'आधीच खाते आहे? लॉगिन करा',
        logout: 'लॉग आउट',
        error: 'प्रमाणीकरण अयशस्वी',
        offlineMode: 'ऑफलाईन डेमो मोडमध्ये सुरू ठेवा',
        offlineNotice: 'सर्व्हरशिवाय चाचणी करत आहात? ऑफलाईन मोडमध्ये प्रवेश करा.',
        serverUnreachable: 'सर्व्हर उपलब्ध नाही. आपण ऑफलाईन मोडमध्ये सुरू ठेवू इच्छिता?',
        useOfflineNow: 'या प्रोफाइलसह ऑफलाईन सुरू ठेवा'
      },
      nav: {
        map: 'नकाशा',
        report: 'तक्रार नोंदवा',
        myReports: 'माझ्या तक्रारी',
        quickAdd: 'जलद नोंद',
        analytics: 'प्रशासन',
      },
      status: {
        saved: 'फोनवर सुरक्षित',
        syncing: 'सर्व्हरला सिंक होत आहे...',
        submitted: 'सादर केले',
        offline: 'ऑफलाईन मोड',
        online: 'ऑनलाईन',
        coldStart: 'फोनवर सुरक्षित. पंचायत सर्व्हरशी जोडत आहे...',
      },
      categories: {
        water: 'पाणी पुरवठा',
        lighting: 'स्ट्रीट लाईट',
        sanitation: 'स्वच्छता व शौचालय',
        roads: 'रस्ते व गटारे',
        health: 'आरोग्य केंद्र (PHC)',
        education: 'शाळा / अंगणवाडी',
      },
      actions: {
        reportIssue: 'समस्या नोंदवा',
        addAsset: 'ग्राम मालमत्ता जोडा',
        syncNow: 'आता सिंक करा',
        printReport: 'अहवाल मुद्रित करा',
        takePhoto: 'फोटो काढा',
        compressing: 'फोटो ऑप्टिमाइझ होत आहे...',
      },
    },
  },
};

const getInitialLanguage = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('civiclens_language');
    if (saved && (saved === 'en' || saved === 'hi' || saved === 'mr')) {
      return saved;
    }
  }
  return 'en'; // Default to English as primary
};

export const setAppLanguage = (lng: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('civiclens_language', lng);
  }
  i18n.changeLanguage(lng);
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

