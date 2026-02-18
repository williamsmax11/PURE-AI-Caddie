import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Environment & Config ───────────────────────────────────────────────────

const GOLFBERT_API_KEY = Deno.env.get("GOLFBERT_API_KEY")!;
const GOLFBERT_ACCESS_KEY = Deno.env.get("GOLFBERT_ACCESS_KEY")!;
const GOLFBERT_SECRET_KEY = Deno.env.get("GOLFBERT_SECRET_KEY")!;
const GOLFBERT_REGION = Deno.env.get("GOLFBERT_API_REGION") || "us-east-1";
const GOLFBERT_HOST = "api.golfbert.com";
const GOLFBERT_SERVICE = "execute-api";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── AWS Signature V4 ──────────────────────────────────────────────────────

const encoder = new TextEncoder();

async function hmacSha256(
  key: ArrayBuffer | Uint8Array,
  message: string
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(
    encoder.encode("AWS4" + secretKey),
    dateStamp
  );
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function signedGolfbertRequest(
  method: string,
  path: string,
  queryString = ""
): Promise<Response> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256Hex("");
  const canonicalHeaders =
    `host:${GOLFBERT_HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-api-key:${GOLFBERT_API_KEY}\n`;
  const signedHeaders = "host;x-amz-date;x-api-key";

  const canonicalRequest = [
    method,
    path,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${GOLFBERT_REGION}/${GOLFBERT_SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSigningKey(
    GOLFBERT_SECRET_KEY,
    dateStamp,
    GOLFBERT_REGION,
    GOLFBERT_SERVICE
  );
  const signatureBuffer = await hmacSha256(signingKey, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${GOLFBERT_ACCESS_KEY}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${GOLFBERT_HOST}${path}${
    queryString ? "?" + queryString : ""
  }`;

  return fetch(url, {
    method,
    headers: {
      Host: GOLFBERT_HOST,
      "x-amz-date": amzDate,
      "x-api-key": GOLFBERT_API_KEY,
      Authorization: authorization,
    },
  });
}

// ─── Golfbert API Wrappers ──────────────────────────────────────────────────

interface GolfbertCourse {
  id: number;
  name: string;
  address?: {
    country?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  phonenumber?: string;
  coordinates?: { lat: number; long: number };
}

interface GolfbertTeeBox {
  courseid: number;
  color: string;
  teeboxtype: string;
  slope: number;
  rating: number;
}

interface GolfbertHoleVector {
  type: string; // "Flag", "Blue", "White", "Red", etc.
  lat: number;
  long: number;
}

interface GolfbertHole {
  id: number;
  number: number;
  courseid: number;
  rotation?: number;
  range?: {
    x: { min: number; max: number };
    y: { min: number; max: number };
  };
  dimensions?: { width: number; height: number };
  vectors?: GolfbertHoleVector[];
  flagcoords?: { lat: number; long: number };
}

interface GolfbertScorecardEntry {
  holeid: number;
  holenumber: number;
  color: string;
  length: number;
  par: number;
  handicap: number;
  teeboxtype: string;
}

interface GolfbertPolygonPoint {
  lat: number;
  long: number;
}

interface GolfbertPolygon {
  holeid: number;
  surfacetype: string;
  polygon: GolfbertPolygonPoint[];
}

async function golfbertGet<T>(path: string, query = ""): Promise<T> {
  const res = await signedGolfbertRequest("GET", path, query);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Golfbert API ${res.status}: ${text}`);
  }
  return res.json();
}

async function searchCoursesByLocation(
  lat: number,
  lng: number
): Promise<GolfbertCourse[]> {
  const data = await golfbertGet<{ resources: GolfbertCourse[] }>(
    "/v1/courses",
    `lat=${lat}&long=${lng}`
  );
  return data.resources || [];
}

async function getCourseDetails(
  courseId: number
): Promise<GolfbertCourse | null> {
  // The search endpoint with specific coords should return the course,
  // but we can also get it by listing. For now we use the search result
  // cached from the import flow. If a dedicated endpoint exists, use it.
  // Golfbert doesn't document a GET /v1/courses/{id} single-course endpoint
  // in the examples provided, so we rely on data from the search + other endpoints.
  return null;
}

async function getCourseTeeBoxes(
  courseId: number
): Promise<GolfbertTeeBox[]> {
  const data = await golfbertGet<{ resources: GolfbertTeeBox[] }>(
    `/v1/courses/${courseId}/teeboxes`
  );
  return data.resources || [];
}

async function getCourseHoles(courseId: number): Promise<GolfbertHole[]> {
  const data = await golfbertGet<{ resources: GolfbertHole[] }>(
    `/v1/courses/${courseId}/holes`
  );
  return data.resources || [];
}

async function getCourseScorecard(
  courseId: number
): Promise<{ courseid: number; coursename: string; holeteeboxes: GolfbertScorecardEntry[] }> {
  return golfbertGet(`/v1/courses/${courseId}/scorecard`);
}

async function getHolePolygons(holeId: number): Promise<GolfbertPolygon[]> {
  const data = await golfbertGet<{ resources: GolfbertPolygon[] }>(
    `/v1/holes/${holeId}/polygons`
  );
  return data.resources || [];
}

// ─── Polygon Type Mapping ───────────────────────────────────────────────────

function mapSurfaceType(golfbertType: string): string {
  const mapping: Record<string, string> = {
    Green: "green",
    Fairway: "fairway",
    Bunker: "bunker",
    Sand: "bunker",
    Water: "water",
    "Lateral Water": "water",
    "Out of Bounds": "out_of_bounds",
    Trees: "trees",
    Woods: "trees",
    Rough: "hazard",
    "Heavy Rough": "hazard",
    "Tee Box": "tee_box",
    "Cart Path": "other",
  };
  return mapping[golfbertType] || "other";
}

// ─── Import Logic ───────────────────────────────────────────────────────────

async function importCourse(
  supabase: ReturnType<typeof createClient>,
  golfbertCourseId: number,
  courseSearchData?: GolfbertCourse
) {
  const warnings: string[] = [];

  // 1. Fetch teeboxes, holes, scorecard in parallel
  const [teeboxes, holes, scorecard] = await Promise.all([
    getCourseTeeBoxes(golfbertCourseId),
    getCourseHoles(golfbertCourseId),
    getCourseScorecard(golfbertCourseId),
  ]);

  // 2. Build course data from scorecard + search data
  const courseName =
    scorecard.coursename ||
    courseSearchData?.name ||
    `Course ${golfbertCourseId}`;
  const address = courseSearchData?.address;
  const coords = courseSearchData?.coordinates;

  // Calculate total yardage from the first tee type in scorecard
  const firstTeeColor = teeboxes.length > 0 ? teeboxes[0].color : null;
  const firstTeeEntries = firstTeeColor
    ? scorecard.holeteeboxes.filter((e) => e.color === firstTeeColor)
    : [];
  const totalYardage = firstTeeEntries.reduce((sum, e) => sum + e.length, 0);

  // Find primary tee for course-level rating/slope
  const primaryTee =
    teeboxes.find(
      (t) =>
        t.teeboxtype.toLowerCase().includes("men") ||
        t.teeboxtype.toLowerCase() === "regular"
    ) || teeboxes[0];

  // 3. Upsert Course
  const courseRow = {
    name: courseName,
    city: address?.city || null,
    state: address?.state || null,
    full_address: address
      ? [address.street, address.city, address.state, address.zip]
          .filter(Boolean)
          .join(", ")
      : null,
    phone: courseSearchData?.phonenumber || null,
    latitude: coords?.lat || null,
    longitude: coords?.long || null,
    num_holes: holes.length || 18,
    course_rating: primaryTee?.rating || null,
    slope_rating: primaryTee?.slope || null,
    length_yds: totalYardage || null,
    golfbert_id: golfbertCourseId,
    golfbert_synced_at: new Date().toISOString(),
  };

  const { data: courseData, error: courseError } = await supabase
    .from("Courses")
    .upsert(courseRow, { onConflict: "golfbert_id" })
    .select("id")
    .single();

  if (courseError) {
    throw new Error(`Failed to upsert course: ${courseError.message}`);
  }
  const courseId = courseData.id;

  // 4. Upsert TeeBoxes
  const teeBoxRows = teeboxes.map((tb, idx) => {
    // Calculate total yardage for this tee from scorecard
    const teeEntries = scorecard.holeteeboxes.filter(
      (e) => e.color === tb.color
    );
    const teeYardage = teeEntries.reduce((sum, e) => sum + e.length, 0);
    const teePar = teeEntries.reduce((sum, e) => sum + e.par, 0);

    return {
      course_id: courseId,
      tee_color: tb.color,
      tee_type: tb.teeboxtype,
      total_yardage: teeYardage || null,
      course_rating: tb.rating,
      slope_rating: tb.slope,
      par_total: teePar || null,
      sort_order: idx,
    };
  });

  // Sort by yardage descending for display order
  teeBoxRows.sort(
    (a, b) => (b.total_yardage || 0) - (a.total_yardage || 0)
  );
  teeBoxRows.forEach((r, i) => (r.sort_order = i));

  let teeBoxMap: Record<string, string> = {}; // color -> tee_box_id
  if (teeBoxRows.length > 0) {
    const { data: teeData, error: teeError } = await supabase
      .from("TeeBoxes")
      .upsert(teeBoxRows, { onConflict: "course_id,tee_color" })
      .select("id, tee_color");

    if (teeError) {
      warnings.push(`TeeBox upsert error: ${teeError.message}`);
    } else if (teeData) {
      for (const row of teeData) {
        teeBoxMap[row.tee_color] = row.id;
      }
    }
  }

  // 5. Upsert Holes
  // Build a map of tee vectors per hole per color from the holes data
  const holeVectorsMap: Record<
    number,
    Record<string, { lat: number; long: number }>
  > = {};
  for (const hole of holes) {
    holeVectorsMap[hole.number] = {};
    if (hole.vectors) {
      for (const v of hole.vectors) {
        holeVectorsMap[hole.number][v.type] = { lat: v.lat, long: v.long };
      }
    }
  }

  // Determine default tee color for the Holes table tee_latitude/longitude
  const defaultTeeColor = primaryTee?.color || teeboxes[0]?.color || "Blue";

  const holeRows = holes.map((h) => {
    const vectors = holeVectorsMap[h.number] || {};
    const defaultTee = vectors[defaultTeeColor] || Object.values(vectors)[0];
    const flagCoords = vectors["Flag"] || h.flagcoords;

    // Get par/yardage/handicap from scorecard for default tee
    const scorecardEntry = scorecard.holeteeboxes.find(
      (e) => e.holenumber === h.number && e.color === defaultTeeColor
    );

    return {
      course_id: courseId,
      hole_number: h.number,
      golfbert_id: h.id,
      par: scorecardEntry?.par || null,
      yardage: scorecardEntry?.length || null,
      handicap_index: scorecardEntry?.handicap || null,
      tee_latitude: defaultTee?.lat || null,
      tee_longitude: defaultTee?.long || null,
      green_latitude: flagCoords?.lat || null,
      green_longitude: flagCoords?.long || null,
    };
  });

  // We need to upsert holes and get back their IDs
  // Since there's no unique constraint on (course_id, hole_number) by default,
  // we need to handle this carefully. First delete existing holes for this course,
  // then insert. Or add a unique constraint.
  // For safety, let's delete + insert (polygons cascade via hole_id FK).

  // Delete existing holes for this course (cascades to HolePolygon and HoleTeeData via FK)
  // First get existing hole IDs to clean up HoleTeeData
  const { data: existingHoles } = await supabase
    .from("Holes")
    .select("id")
    .eq("course_id", courseId);

  if (existingHoles && existingHoles.length > 0) {
    const existingHoleIds = existingHoles.map((h: { id: string }) => h.id);
    await supabase.from("HoleTeeData").delete().in("hole_id", existingHoleIds);
    await supabase.from("HolePolygon").delete().in("hole_id", existingHoleIds);
  }

  const { error: deleteHolesError } = await supabase
    .from("Holes")
    .delete()
    .eq("course_id", courseId);

  if (deleteHolesError) {
    warnings.push(`Delete holes error: ${deleteHolesError.message}`);
  }

  const { data: insertedHoles, error: holesError } = await supabase
    .from("Holes")
    .insert(holeRows)
    .select("id, hole_number, golfbert_id");

  if (holesError) {
    throw new Error(`Failed to insert holes: ${holesError.message}`);
  }

  // Build maps for hole lookups
  const holeIdByNumber: Record<number, string> = {};
  const golfbertHoleIdByNumber: Record<number, number> = {};
  for (const h of insertedHoles || []) {
    holeIdByNumber[h.hole_number] = h.id;
    golfbertHoleIdByNumber[h.hole_number] = h.golfbert_id;
  }

  // 6. Insert HoleTeeData (per-hole per-tee yardage + tee coords)
  const holeTeeDataRows: Array<Record<string, unknown>> = [];
  for (const entry of scorecard.holeteeboxes) {
    const holeId = holeIdByNumber[entry.holenumber];
    const teeBoxId = teeBoxMap[entry.color];
    if (!holeId || !teeBoxId) continue;

    // Get tee coordinates for this color on this hole
    const vectors = holeVectorsMap[entry.holenumber] || {};
    const teeCoords = vectors[entry.color];

    holeTeeDataRows.push({
      hole_id: holeId,
      tee_box_id: teeBoxId,
      yardage: entry.length,
      par: entry.par,
      handicap_index: entry.handicap,
      tee_latitude: teeCoords?.lat || null,
      tee_longitude: teeCoords?.long || null,
    });
  }

  let holeTeeDataCount = 0;
  if (holeTeeDataRows.length > 0) {
    const { error: htdError } = await supabase
      .from("HoleTeeData")
      .insert(holeTeeDataRows);

    if (htdError) {
      warnings.push(`HoleTeeData insert error: ${htdError.message}`);
    } else {
      holeTeeDataCount = holeTeeDataRows.length;
    }
  }

  // 7. Fetch and insert polygons for each hole
  let polygonsImported = 0;
  const allPolygonRows: Array<Record<string, unknown>> = [];

  // Fetch polygons with concurrency limit (3 at a time)
  const holeNumbers = Object.keys(golfbertHoleIdByNumber).map(Number);
  for (let i = 0; i < holeNumbers.length; i += 3) {
    const batch = holeNumbers.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map(async (holeNum) => {
        const gbHoleId = golfbertHoleIdByNumber[holeNum];
        const polygons = await getHolePolygons(gbHoleId);
        const holeId = holeIdByNumber[holeNum];

        for (const poly of polygons) {
          const appType = mapSurfaceType(poly.surfacetype);
          if (appType === "other" || appType === "tee_box") continue;

          allPolygonRows.push({
            hole_id: holeId,
            type: appType,
            name: poly.surfacetype,
            golfbert_surface_type: poly.surfacetype,
            coordinates: poly.polygon.map((p) => ({
              latitude: p.lat,
              longitude: p.long,
            })),
          });
        }
      })
    );

    for (const result of results) {
      if (result.status === "rejected") {
        warnings.push(`Polygon fetch error: ${result.reason}`);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + 3 < holeNumbers.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  if (allPolygonRows.length > 0) {
    const { error: polyError } = await supabase
      .from("HolePolygon")
      .insert(allPolygonRows);

    if (polyError) {
      warnings.push(`Polygon insert error: ${polyError.message}`);
    } else {
      polygonsImported = allPolygonRows.length;
    }
  }

  return {
    success: true,
    course_id: courseId,
    course_name: courseName,
    holes_imported: insertedHoles?.length || 0,
    teeboxes_imported: Object.keys(teeBoxMap).length,
    hole_tee_data_imported: holeTeeDataCount,
    polygons_imported: polygonsImported,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ─── Main Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!GOLFBERT_API_KEY || !GOLFBERT_ACCESS_KEY || !GOLFBERT_SECRET_KEY) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Golfbert API not configured. Set GOLFBERT_API_KEY, GOLFBERT_ACCESS_KEY, and GOLFBERT_SECRET_KEY secrets.",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { mode } = body;

    // ── Mode: search_courses ──────────────────────────────────────────
    if (mode === "search_courses") {
      const { latitude, longitude } = body;
      if (latitude == null || longitude == null) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "latitude and longitude are required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const courses = await searchCoursesByLocation(latitude, longitude);

      // Check which courses are already in our DB
      const golfbertIds = courses.map((c) => c.id);
      const { data: existingCourses } = await supabase
        .from("Courses")
        .select("golfbert_id, id")
        .in("golfbert_id", golfbertIds);

      const existingMap = new Map(
        (existingCourses || []).map((c: { golfbert_id: number; id: string }) => [
          c.golfbert_id,
          c.id,
        ])
      );

      const results = courses.map((c) => ({
        golfbert_id: c.id,
        name: c.name,
        address: c.address,
        coordinates: c.coordinates,
        phone: c.phonenumber,
        already_imported: existingMap.has(c.id),
        local_course_id: existingMap.get(c.id) || null,
      }));

      return new Response(
        JSON.stringify({ success: true, courses: results }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Mode: import_course ───────────────────────────────────────────
    if (mode === "import_course") {
      const { golfbert_course_id, course_data } = body;
      if (!golfbert_course_id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "golfbert_course_id is required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const result = await importCourse(
        supabase,
        golfbert_course_id,
        course_data
      );

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Mode: sync_course ─────────────────────────────────────────────
    if (mode === "sync_course") {
      const { course_id } = body;
      if (!course_id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "course_id is required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Look up the golfbert_id from local DB
      const { data: courseRow, error: lookupError } = await supabase
        .from("Courses")
        .select("golfbert_id")
        .eq("id", course_id)
        .single();

      if (lookupError || !courseRow?.golfbert_id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Course not found or has no Golfbert ID",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const result = await importCourse(supabase, courseRow.golfbert_id);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: `Unknown mode: ${mode}. Use search_courses, import_course, or sync_course.`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Golfbert import error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal error during Golfbert import",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
