import { supabase } from '../config/supabase';

/**
 * Search for courses near GPS coordinates via Golfbert API.
 * Returns array of courses with golfbert_id, name, address, coordinates,
 * and whether they're already imported into the local DB.
 */
export async function searchNearbyGolfbertCourses(latitude, longitude) {
  const { data, error } = await supabase.functions.invoke('golfbert-import', {
    body: { mode: 'search_courses', latitude, longitude },
  });

  if (error) {
    console.error('Golfbert search error:', error.message);
    return { data: [], error: error.message };
  }

  if (!data?.success) {
    return { data: [], error: data?.error || 'Unknown error' };
  }

  return { data: data.courses || [], error: null };
}

/**
 * Import a Golfbert course into the local database.
 * Fetches all course data (teeboxes, holes, scorecard, polygons) and stores it.
 *
 * @param {number} golfbertCourseId - The Golfbert course ID
 * @param {object} [courseData] - Optional course data from a previous search result
 *   (name, address, coordinates) to avoid an extra API call.
 * @returns {{ data: { course_id, course_name, holes_imported, ... } | null, error: string | null }}
 */
export async function importGolfbertCourse(golfbertCourseId, courseData = null) {
  const { data, error } = await supabase.functions.invoke('golfbert-import', {
    body: {
      mode: 'import_course',
      golfbert_course_id: golfbertCourseId,
      course_data: courseData,
    },
  });

  if (error) {
    console.error('Golfbert import error:', error.message);
    return { data: null, error: error.message };
  }

  if (!data?.success) {
    return { data: null, error: data?.error || 'Import failed' };
  }

  return { data, error: null };
}

/**
 * Re-sync an existing course's data from Golfbert.
 * Refreshes teeboxes, holes, scorecard, and polygons.
 *
 * @param {string} courseId - The local Supabase course UUID
 */
export async function syncCourse(courseId) {
  const { data, error } = await supabase.functions.invoke('golfbert-import', {
    body: { mode: 'sync_course', course_id: courseId },
  });

  if (error) {
    console.error('Golfbert sync error:', error.message);
    return { data: null, error: error.message };
  }

  if (!data?.success) {
    return { data: null, error: data?.error || 'Sync failed' };
  }

  return { data, error: null };
}
