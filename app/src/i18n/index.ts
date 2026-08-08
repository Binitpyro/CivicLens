import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      appName: 'CivicLens',
      tagline: 'GIS Village Infrastructure Monitoring',
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

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'hi', // Default to Hindi for rural Indian context
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
