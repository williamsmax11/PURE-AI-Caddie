import { supabase } from '../config/supabase';
import { calculateDistance } from '../utils/geoUtils';

/**
 * Find the front and back of the green relative to the tee box
 * Front = closest point to tee, Back = furthest point from tee
 */
function calculateGreenFrontBack(greenPolygon, teeBox) {
  if (!greenPolygon || !greenPolygon.coordinates || greenPolygon.coordinates.length < 3) {
    return { greenFront: null, greenBack: null };
  }

  let minDist = Infinity;
  let maxDist = -Infinity;
  let greenFront = null;
  let greenBack = null;

  for (const coord of greenPolygon.coordinates) {
    const dist = calculateDistance(teeBox, coord);
    if (dist < minDist) {
      minDist = dist;
      greenFront = coord;
    }
    if (dist > maxDist) {
      maxDist = dist;
      greenBack = coord;
    }
  }

  return { greenFront, greenBack };
}

function normalizeHole(row) {
  return {
    par: row.par,
    yardage: row.yardage,
    handicap: row.handicap_index,
    aiTip: '',
    teeBox: {
      latitude: row.tee_latitude,
      longitude: row.tee_longitude,
    },
    green: {
      latitude: row.green_latitude,
      longitude: row.green_longitude,
    },
    greenFront: null, // Will be calculated from green polygon
    greenBack: null,  // Will be calculated from green polygon
    aiSuggestedShots: [],
    hazards: [],
    polygons: [],
  };
}

function normalizePolygon(row) {
  return {
    id: row.id,
    type: row.type,
    label: row.name || '',
    coordinates: row.coordinates || [],
  };
}

/**
 * Fetch all holes for a course (with their polygons) and return them keyed by hole_number.
 * When teeBoxId is provided, overrides yardage/par/handicap/tee coords with tee-specific data.
 * Returns { data: { 1: {...}, 2: {...}, ... }, error: string | null }
 */
export async function fetchHolesByCourse(courseId, teeBoxId = null) {
  const { data, error } = await supabase
    .from('Holes')
    .select('*')
    .eq('course_id', courseId)
    .order('hole_number', { ascending: true });

  if (error) {
    console.error('Error fetching holes:', error.message);
    return { data: {}, error: error.message };
  }

  // Build holes map first
  const holesMap = {};
  const holeIdToNumber = {};
  (data || []).forEach(row => {
    holesMap[row.hole_number] = normalizeHole(row);
    holeIdToNumber[row.id] = row.hole_number;
  });

  // If a specific tee box is selected, override hole data with tee-specific values
  const holeIds = (data || []).map(row => row.id);
  if (teeBoxId && holeIds.length > 0) {
    const { data: teeData, error: teeError } = await supabase
      .from('HoleTeeData')
      .select('*')
      .in('hole_id', holeIds)
      .eq('tee_box_id', teeBoxId);

    if (teeError) {
      console.warn('Error fetching tee data:', teeError.message);
    } else if (teeData) {
      teeData.forEach(td => {
        const holeNum = holeIdToNumber[td.hole_id];
        if (holeNum && holesMap[holeNum]) {
          if (td.yardage != null) holesMap[holeNum].yardage = td.yardage;
          if (td.par != null) holesMap[holeNum].par = td.par;
          if (td.handicap_index != null) holesMap[holeNum].handicap = td.handicap_index;
          if (td.tee_latitude != null && td.tee_longitude != null) {
            holesMap[holeNum].teeBox = {
              latitude: td.tee_latitude,
              longitude: td.tee_longitude,
            };
          }
        }
      });
    }
  }

  // Fetch polygons for all holes in this course
  if (holeIds.length > 0) {
    const { data: polyData, error: polyError } = await supabase
      .from('HolePolygon')
      .select('*')
      .in('hole_id', holeIds);

    if (polyError) {
      console.warn('Error fetching polygons:', polyError.message);
    } else if (polyData) {
      polyData.forEach(row => {
        const holeNum = holeIdToNumber[row.hole_id];
        if (holeNum && holesMap[holeNum]) {
          holesMap[holeNum].polygons.push(normalizePolygon(row));
        }
      });

      // Calculate greenFront and greenBack from green polygon for each hole
      Object.keys(holesMap).forEach(holeNum => {
        const hole = holesMap[holeNum];
        const greenPolygon = hole.polygons.find(p => p.type === 'green');
        if (greenPolygon && hole.teeBox) {
          const { greenFront, greenBack } = calculateGreenFrontBack(greenPolygon, hole.teeBox);
          hole.greenFront = greenFront;
          hole.greenBack = greenBack;
        }
      });
    }
  }

  return { data: holesMap, error: null };
}
