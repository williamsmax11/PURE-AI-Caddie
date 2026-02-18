import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://iwfrlkqhwzksiuwlnaap.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3ZnJsa3Fod3prc2l1d2xuYWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MzU3NzQsImV4cCI6MjA4NTExMTc3NH0.9T-zAQmQEk7TxFm82_pDClkWkYeSTPFXdzLnmYXXRu0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
