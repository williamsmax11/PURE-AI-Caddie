import { supabase } from '../config/supabase';

function normalizeCourse(row) {
  return {
    id: row.id,
    name: row.name,
    location: [row.city, row.state].filter(Boolean).join(', '),
    rating: row.course_rating,
    slope: row.slope_rating,
    yardage: row.length_yds,
    phone: row.phone,
    website: row.website,
    full_address: row.full_address,
    num_holes: row.num_holes,
    latitude: row.latitude,
    longitude: row.longitude,
    golfbertId: row.golfbert_id || null,
    golfbertSyncedAt: row.golfbert_synced_at || null,

    // Placeholders — future: derived from rounds table
    lastPlayed: null,
    averageScore: null,
    roundsPlayed: 0,
    bestScore: null,
    troubleHoles: [],
    imageUrl: null,
    notes: [],
  };
}

export async function fetchAllCourses() {
  const { data, error } = await supabase
    .from('Courses')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching courses:', error.message);
    return { data: [], error: error.message };
  }

  return {
    data: (data || []).map(normalizeCourse),
    error: null,
  };
}

/**
 * Fetch courses with pagination support.
 * @param {number} page - Page number (0-indexed)
 * @param {number} pageSize - Number of courses per page
 * @returns {Promise<{data: Array, hasMore: boolean, total: number, error: string|null}>}
 */
export async function fetchCoursesPaginated(page = 0, pageSize = 10) {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  // Get total count first
  const { count, error: countError } = await supabase
    .from('Courses')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('Error fetching course count:', countError.message);
    return { data: [], hasMore: false, total: 0, error: countError.message };
  }

  const { data, error } = await supabase
    .from('Courses')
    .select('*')
    .order('name', { ascending: true })
    .range(from, to);

  if (error) {
    console.error('Error fetching courses:', error.message);
    return { data: [], hasMore: false, total: count || 0, error: error.message };
  }

  const normalizedData = (data || []).map(normalizeCourse);
  const hasMore = (from + normalizedData.length) < (count || 0);

  return {
    data: normalizedData,
    hasMore,
    total: count || 0,
    error: null,
  };
}

export async function fetchCourseById(courseId) {
  const { data, error } = await supabase
    .from('Courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (error) {
    console.error('Error fetching course:', error.message);
    return { data: null, error: error.message };
  }

  return {
    data: data ? normalizeCourse(data) : null,
    error: null,
  };
}

/**
 * Fetch tee box options for a course from the TeeBoxes table.
 * Returns sorted array (longest tees first).
 */
export async function fetchTeeBoxes(courseId) {
  const { data, error } = await supabase
    .from('TeeBoxes')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching tee boxes:', error.message);
    return { data: [], error: error.message };
  }

  return {
    data: (data || []).map(row => ({
      id: row.id,
      color: row.tee_color,
      colorHex: row.tee_color_hex,
      type: row.tee_type,
      yardage: row.total_yardage,
      rating: row.course_rating,
      slope: row.slope_rating,
      parTotal: row.par_total,
      sortOrder: row.sort_order,
    })),
    error: null,
  };
}

/**
 * Find courses already in the local DB near a GPS location.
 * Uses a simple bounding-box filter (~10 mile radius ≈ 0.145 degrees).
 */
export async function fetchNearbyCourses(latitude, longitude, radiusDeg = 0.145) {
  const { data, error } = await supabase
    .from('Courses')
    .select('*')
    .gte('latitude', latitude - radiusDeg)
    .lte('latitude', latitude + radiusDeg)
    .gte('longitude', longitude - radiusDeg)
    .lte('longitude', longitude + radiusDeg)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching nearby courses:', error.message);
    return { data: [], error: error.message };
  }

  return {
    data: (data || []).map(normalizeCourse),
    error: null,
  };
}

/**
 * Search courses by name or city/state (server-side).
 * Uses Supabase ilike for case-insensitive matching.
 * @param {string} query - Search term
 * @param {number} limit - Max results to return
 * @returns {Promise<{data: Array, error: string|null}>}
 */
/**
 * Fetch all holes for a course, including tee-specific data and hazard counts.
 * @param {string} courseId - Course UUID
 * @param {string} teeBoxId - Optional tee box UUID for tee-specific yardage/par
 * @returns {Promise<{data: Array, error: string|null}>}
 */
export async function fetchCourseHoles(courseId, teeBoxId = null) {
  // Fetch base hole data
  const { data: holes, error: holesError } = await supabase
    .from('Holes')
    .select('id, hole_number, par, yardage, handicap_index, tee_latitude, tee_longitude, green_latitude, green_longitude')
    .eq('course_id', courseId)
    .order('hole_number', { ascending: true });

  if (holesError) {
    console.error('Error fetching course holes:', holesError.message);
    return { data: [], error: holesError.message };
  }

  if (!holes || holes.length === 0) {
    return { data: [], error: null };
  }

  // If teeBoxId provided, fetch tee-specific data (overrides base yardage/par)
  let teeDataMap = {};
  if (teeBoxId) {
    const holeIds = holes.map(h => h.id);
    const { data: teeData, error: teeError } = await supabase
      .from('HoleTeeData')
      .select('hole_id, yardage, par, handicap_index')
      .eq('tee_box_id', teeBoxId)
      .in('hole_id', holeIds);

    if (!teeError && teeData) {
      teeData.forEach(td => {
        teeDataMap[td.hole_id] = td;
      });
    }
  }

  // Fetch hazard polygons for all holes (just type counts, not full coordinates)
  const holeIds = holes.map(h => h.id);
  const { data: polygons } = await supabase
    .from('HolePolygon')
    .select('hole_id, type, name')
    .in('hole_id', holeIds);

  // Group hazards by hole
  const hazardMap = {};
  if (polygons) {
    polygons.forEach(p => {
      if (!hazardMap[p.hole_id]) hazardMap[p.hole_id] = [];
      hazardMap[p.hole_id].push({ type: p.type, name: p.name });
    });
  }

  // Merge everything
  const enrichedHoles = holes.map(hole => {
    const teeOverride = teeDataMap[hole.id];
    return {
      id: hole.id,
      holeNumber: hole.hole_number,
      par: teeOverride?.par ?? hole.par,
      yardage: teeOverride?.yardage ?? hole.yardage,
      handicapIndex: teeOverride?.handicap_index ?? hole.handicap_index,
      teeLat: hole.tee_latitude,
      teeLng: hole.tee_longitude,
      greenLat: hole.green_latitude,
      greenLng: hole.green_longitude,
      hazards: hazardMap[hole.id] || [],
    };
  });

  return { data: enrichedHoles, error: null };
}

export async function searchCourses(query, limit = 20) {
  if (!query || query.trim().length === 0) {
    return { data: [], error: null };
  }

  const pattern = `%${query.trim()}%`;

  const { data, error } = await supabase
    .from('Courses')
    .select('*')
    .or(`name.ilike.${pattern},city.ilike.${pattern},state.ilike.${pattern}`)
    .order('name', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error searching courses:', error.message);
    return { data: [], error: error.message };
  }

  return {
    data: (data || []).map(normalizeCourse),
    error: null,
  };
}
