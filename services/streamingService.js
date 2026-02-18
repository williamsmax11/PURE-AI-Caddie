import { supabase } from '../config/supabase';

const SUPABASE_URL = 'https://iwfrlkqhwzksiuwlnaap.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3ZnJsa3Fod3prc2l1d2xuYWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MzU3NzQsImV4cCI6MjA4NTExMTc3NH0.9T-zAQmQEk7TxFm82_pDClkWkYeSTPFXdzLnmYXXRu0';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/pure`;

/**
 * Parse SSE events from a text buffer.
 * Returns { events: parsed events array, remaining: unparsed buffer }
 */
function parseSSEBuffer(buffer) {
  const events = [];
  const parts = buffer.split('\n\n');
  const remaining = parts.pop() || '';

  for (const part of parts) {
    if (!part.trim()) continue;

    const eventTypeMatch = part.match(/^event: (.+)$/m);
    const dataMatch = part.match(/^data: (.+)$/m);

    if (!eventTypeMatch || !dataMatch) continue;

    try {
      events.push({
        type: eventTypeMatch[1],
        data: JSON.parse(dataMatch[1]),
      });
    } catch (e) {
      // skip unparseable events
    }
  }

  return { events, remaining };
}

/**
 * Stream a hole plan from the Pure edge function via SSE.
 * Uses XMLHttpRequest for React Native compatibility (fetch doesn't support ReadableStream).
 *
 * @param {Object} payload - The request payload (same shape as planHole)
 * @param {Object} callbacks
 * @param {Function} callbacks.onText - Called with text chunks
 * @param {Function} callbacks.onShot - Called with individual shot objects
 * @param {Function} callbacks.onPlanMeta - Called with plan metadata
 * @param {Function} callbacks.onDone - Called when stream completes
 * @param {Function} callbacks.onError - Called with error message string
 * @returns {Function} abort - Call to cancel the stream
 */
export function streamHolePlan(payload, callbacks) {
  console.log('[Stream] 1. streamHolePlan started');
  let aborted = false;
  let xhr = null;

  (async () => {
    try {
      console.log('[Stream] 2. Refreshing session');
      // Refresh the session to ensure we have a valid JWT token
      // This prevents 401 errors from expired tokens
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('Session refresh failed:', refreshError.message);
        // If refresh fails completely, user may need to sign in again
        if (refreshError.message?.includes('invalid') || refreshError.message?.includes('expired')) {
          callbacks.onError?.('Session expired. Please sign out and sign back in.');
          return;
        }
      }

      // Get the (now fresh) session token
      const { data: { session } } = await supabase.auth.getSession();

      // Log session state for debugging
      console.log('[Stream] 3. Session obtained:', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
      });

      if (aborted) return;

      // Use session token if available, otherwise fall back to anon key
      const authToken = session?.access_token || SUPABASE_ANON_KEY;

      xhr = new XMLHttpRequest();
      xhr.open('POST', EDGE_FUNCTION_URL);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);

      let buffer = '';
      let processedLength = 0;
      let doneEmitted = false;

      xhr.onreadystatechange = () => {
        console.log('[Stream] onreadystatechange, readyState:', xhr.readyState, 'status:', xhr.status);
        // readyState 3 = LOADING (data is being received)
        // readyState 4 = DONE
        if (xhr.readyState === 3 || xhr.readyState === 4) {
          const newText = xhr.responseText.substring(processedLength);
          processedLength = xhr.responseText.length;

          if (newText) {
            buffer += newText;
            const { events, remaining } = parseSSEBuffer(buffer);
            buffer = remaining;

            for (const event of events) {
              if (aborted) return;

              switch (event.type) {
                case 'text':
                  callbacks.onText?.(event.data.text);
                  break;
                case 'shot':
                  console.log('[Stream] Shot event received:', JSON.stringify(event.data));
                  callbacks.onShot?.(event.data);
                  break;
                case 'plan_meta':
                  callbacks.onPlanMeta?.(event.data);
                  break;
                case 'done':
                  doneEmitted = true;
                  callbacks.onDone?.();
                  break;
                case 'error':
                  callbacks.onError?.(event.data.message);
                  return;
              }
            }
          }

          if (xhr.readyState === 4 && !doneEmitted && !aborted) {
            if (xhr.status >= 200 && xhr.status < 300) {
              callbacks.onDone?.();
            } else {
              // Try to extract more error details from the response
              let errorDetail = '';
              try {
                const responseBody = xhr.responseText;
                console.error('Edge function error response:', xhr.status, responseBody);
                if (responseBody) {
                  const parsed = JSON.parse(responseBody);
                  errorDetail = parsed.message || parsed.error || parsed.msg || '';
                }
              } catch (e) {
                // Response wasn't JSON
                errorDetail = xhr.responseText?.substring(0, 100) || '';
              }

              if (xhr.status === 401) {
                callbacks.onError?.(`Authentication error (401): ${errorDetail || 'Please sign out and sign back in'}`);
              } else {
                callbacks.onError?.(`Server error: ${xhr.status}${errorDetail ? ' - ' + errorDetail : ''}`);
              }
            }
          }
        }
      };

      xhr.onerror = () => {
        console.log('[Stream] XHR onerror triggered');
        if (!aborted) {
          callbacks.onError?.('Network error - check your connection');
        }
      };

      console.log('[Stream] 4. About to send XHR');
      xhr.send(JSON.stringify({ ...payload, stream: true }));
      console.log('[Stream] 5. XHR send() called');
    } catch (err) {
      if (!aborted) {
        callbacks.onError?.(err.message || 'Stream connection failed');
      }
    }
  })();

  return () => {
    aborted = true;
    if (xhr) {
      xhr.abort();
    }
  };
}
