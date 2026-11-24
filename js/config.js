// =====================================================================
//  SITE SETTINGS – the only file you need to edit when setting up.
//  See ADMIN_GUIDE.md, steps 3 and 4.
// =====================================================================

// The Diocese Google account. This account can never be locked out:
// it is always an admin. Use all lowercase. It must match firestore.rules.
export const OWNER_EMAIL = "mdys.kalamela@gmail.com";

// Values from Firebase console → Project settings → Your apps → Web app.
// These values are not secret: security comes from firestore.rules, not from hiding them.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCDi9fUglVN1XFrLb6AbGsFtLBuerwC61k",
  authDomain: "mdys-kalamela.firebaseapp.com",
  projectId: "mdys-kalamela",
  storageBucket: "mdys-kalamela.firebasestorage.app",
  messagingSenderId: "376645741788",
  appId: "1:376645741788:web:226b6cbc147664dd46d819",
};

export const SITE_NAME = "MDYS Kalamela";
export const ORG_NAME = "Mar Thoma Yuvajana Sakhyam · Mumbai Diocese";
