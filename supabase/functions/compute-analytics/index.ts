import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// STATISTICAL HELPERS
// ============================================================================

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  const squaredDiffs = arr.map((x) => (x - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (arr.length - 1));
}

function percentageOf(arr: number[], predicate: (d: number) => boolean): number {
  if (arr.length === 0) return 0;
  return arr.filter(predicate).length / arr.length;
}

function calculateConfidence(sampleSize: number): number {
  if (sampleSize < 5) return 0;
  if (sampleSize < 10) return 0.3;
  if (sampleSize < 15) return 0.5;
  if (sampleSize < 20) return 0.65;
  if (sampleSize < 30) return 0.8;
  if (sampleSize < 50) return 0.9;
  return 0.95;
}

// ============================================================================
// TYPES
// ============================================================================

interface Shot {
  club: string;
  distance_actual: number | null;
  distance_planned: number | null;
  distance_offline: number | null;
  distance_to_target: number | null;
  wind_speed: number | null;
  lie_type: string | null;
  result: string | null;
  shot_number: number;
  hole_number: number;
  round_id: string;
}

interface ClubStats {
  club: string;
  avgDistance: number;
  medianDistance: number;
  stdDistance: number;
  maxDistance: number;
  minDistance: number;
  avgOffline: number | null;
  stdOffline: number | null;
  missLeftPct: number;
  missRightPct: number;
  missShortPct: number;
  missLongPct: number;
  dispersionRadius: number | null;
  lateralDispersion: number | null;
  distanceDispersion: number | null;
  avgDistanceToTarget: number | null;
  totalShots: number;
  last10Avg: number | null;
}

interface Tendency {
  tendencyType: string;
  tendencyKey: string;
  tendencyData: Record<string, unknown>;
  confidence: number;
  sampleSize: number;
}

// ============================================================================
// CLUB STATS COMPUTATION
// ============================================================================

function computeClubStats(shots: Shot[]): Record<string, ClubStats> {
  const clubGroups: Record<string, Shot[]> = {};
  for (const shot of shots) {
    if (!shot.club || shot.club === "putter") continue;
    if (shot.distance_actual == null) continue;

    if (!clubGroups[shot.club]) {
      clubGroups[shot.club] = [];
    }
    clubGroups[shot.club].push(shot);
  }

  const clubStats: Record<string, ClubStats> = {};

  for (const [club, clubShots] of Object.entries(clubGroups)) {
    const distances = clubShots
      .map((s) => s.distance_actual!)
      .filter((d) => d > 0);
    const offlines = clubShots
      .map((s) => s.distance_offline)
      .filter((d): d is number => d != null);
    const targDists = clubShots
      .map((s) => s.distance_to_target)
      .filter((d): d is number => d != null);

    if (distances.length === 0) continue;

    const avgDist = mean(distances);
    const medDist = median(distances);
    const stdDist = stdDev(distances);
    const maxDist = Math.max(...distances);
    const minDist = Math.min(...distances);

    const avgOff = offlines.length > 0 ? mean(offlines) : null;
    const stdOff = offlines.length > 1 ? stdDev(offlines) : null;
    const missLeftPct = percentageOf(offlines, (d) => d < -5);
    const missRightPct = percentageOf(offlines, (d) => d > 5);

    const distDiffs = clubShots
      .filter((s) => s.distance_actual != null && s.distance_planned != null)
      .map((s) => s.distance_actual! - s.distance_planned!);
    const missShortPct = percentageOf(distDiffs, (d) => d < -5);
    const missLongPct = percentageOf(distDiffs, (d) => d > 5);

    const lateralDisp = offlines.length > 1 ? stdDev(offlines) : null;
    const distDisp = distances.length > 1 ? stdDev(distances) : null;
    const dispRadius =
      lateralDisp != null && distDisp != null
        ? Math.round(Math.sqrt(lateralDisp ** 2 + distDisp ** 2))
        : null;

    const avgDistToTarget = targDists.length > 0 ? mean(targDists) : null;

    const last10 = distances.slice(-10);
    const last10Avg = last10.length > 0 ? mean(last10) : null;

    clubStats[club] = {
      club,
      avgDistance: Math.round(avgDist * 10) / 10,
      medianDistance: Math.round(medDist * 10) / 10,
      stdDistance: Math.round(stdDist * 10) / 10,
      maxDistance: Math.round(maxDist),
      minDistance: Math.round(minDist),
      avgOffline: avgOff != null ? Math.round(avgOff * 10) / 10 : null,
      stdOffline: stdOff != null ? Math.round(stdOff * 10) / 10 : null,
      missLeftPct: Math.round(missLeftPct * 100),
      missRightPct: Math.round(missRightPct * 100),
      missShortPct: Math.round(missShortPct * 100),
      missLongPct: Math.round(missLongPct * 100),
      dispersionRadius: dispRadius,
      lateralDispersion:
        lateralDisp != null ? Math.round(lateralDisp * 10) / 10 : null,
      distanceDispersion:
        distDisp != null ? Math.round(distDisp * 10) / 10 : null,
      avgDistanceToTarget:
        avgDistToTarget != null
          ? Math.round(avgDistToTarget * 10) / 10
          : null,
      totalShots: clubShots.length,
      last10Avg: last10Avg != null ? Math.round(last10Avg * 10) / 10 : null,
    };
  }

  return clubStats;
}

// ============================================================================
// TENDENCY DETECTION
// ============================================================================

function detectTendencies(
  shots: Shot[],
  clubStats: Record<string, ClubStats>
): Tendency[] {
  const tendencies: Tendency[] = [];

  // --- Club Bias Tendencies ---
  for (const [club, stats] of Object.entries(clubStats)) {
    if (stats.totalShots < 5) continue;

    // Lateral bias
    if (stats.avgOffline != null && Math.abs(stats.avgOffline) > 3) {
      const direction = stats.avgOffline > 0 ? "right" : "left";
      tendencies.push({
        tendencyType: "club_bias",
        tendencyKey: `${club}_miss`,
        tendencyData: {
          direction,
          yards: Math.abs(stats.avgOffline),
          club,
          description: `Tends to miss ${club.replace(/_/g, " ")} ${Math.abs(stats.avgOffline).toFixed(1)} yards ${direction}`,
        },
        confidence: calculateConfidence(stats.totalShots),
        sampleSize: stats.totalShots,
      });
    }

    // Distance bias
    const clubShots = shots.filter(
      (s) =>
        s.club === club &&
        s.distance_actual != null &&
        s.distance_planned != null
    );
    if (clubShots.length >= 5) {
      const distDiffs = clubShots.map(
        (s) => s.distance_actual! - s.distance_planned!
      );
      const avgDiff = mean(distDiffs);
      if (Math.abs(avgDiff) > 5) {
        const bias = avgDiff > 0 ? "long" : "short";
        tendencies.push({
          tendencyType: "club_bias",
          tendencyKey: `${club}_distance`,
          tendencyData: {
            bias,
            yards: Math.abs(avgDiff),
            club,
            description: `Hits ${club.replace(/_/g, " ")} ${Math.abs(avgDiff).toFixed(0)} yards ${bias} on average`,
          },
          confidence: calculateConfidence(clubShots.length),
          sampleSize: clubShots.length,
        });
      }
    }
  }

  // --- Long Iron Aggregate Bias ---
  const longIronClubs = [
    "3_iron",
    "4_iron",
    "5_iron",
    "4_hybrid",
    "5_hybrid",
  ];
  const longIronShots = shots.filter(
    (s) => longIronClubs.includes(s.club) && s.distance_offline != null
  );
  if (longIronShots.length >= 8) {
    const avgOff = mean(longIronShots.map((s) => s.distance_offline!));
    if (Math.abs(avgOff) > 4) {
      const direction = avgOff > 0 ? "right" : "left";
      tendencies.push({
        tendencyType: "club_bias",
        tendencyKey: "long_iron_miss",
        tendencyData: {
          direction,
          yards: Math.abs(avgOff),
          clubs: longIronClubs,
          description: `Tends to push long irons ${Math.abs(avgOff).toFixed(1)} yards ${direction}`,
        },
        confidence: calculateConfidence(longIronShots.length),
        sampleSize: longIronShots.length,
      });
    }
  }

  // --- Distance Range Tendencies ---
  const distRanges = [
    { key: "100_125", min: 100, max: 125 },
    { key: "125_150", min: 125, max: 150 },
    { key: "150_175", min: 150, max: 175 },
    { key: "175_200", min: 175, max: 200 },
    { key: "200_plus", min: 200, max: 999 },
  ];

  for (const range of distRanges) {
    const rangeShots = shots.filter(
      (s) =>
        s.distance_planned != null &&
        s.distance_planned >= range.min &&
        s.distance_planned < range.max &&
        s.result != null
    );

    if (rangeShots.length >= 5) {
      const greenHits = rangeShots.filter(
        (s) => s.result === "green" || s.result === "fringe"
      );
      const girPct = greenHits.length / rangeShots.length;

      tendencies.push({
        tendencyType: "distance_range",
        tendencyKey: range.key,
        tendencyData: {
          girPct: Math.round(girPct * 100),
          totalShots: rangeShots.length,
          greenHits: greenHits.length,
          range: `${range.min}-${range.max === 999 ? "+" : range.max}`,
          description: `${Math.round(girPct * 100)}% GIR from ${range.min}-${range.max === 999 ? "200+" : range.max} yards`,
        },
        confidence: calculateConfidence(rangeShots.length),
        sampleSize: rangeShots.length,
      });
    }
  }

  // --- Condition Tendencies: Wind ---
  const windyShots = shots.filter(
    (s) =>
      s.wind_speed != null && s.wind_speed >= 15 && s.distance_offline != null
  );
  const calmShots = shots.filter(
    (s) =>
      s.wind_speed != null && s.wind_speed < 10 && s.distance_offline != null
  );

  if (windyShots.length >= 5 && calmShots.length >= 5) {
    const windyAvgOff = mean(
      windyShots.map((s) => Math.abs(s.distance_offline!))
    );
    const calmAvgOff = mean(
      calmShots.map((s) => Math.abs(s.distance_offline!))
    );
    const windImpact = windyAvgOff - calmAvgOff;

    if (windImpact > 3) {
      tendencies.push({
        tendencyType: "condition",
        tendencyKey: "wind_over_15",
        tendencyData: {
          windyAvgMiss: Math.round(windyAvgOff * 10) / 10,
          calmAvgMiss: Math.round(calmAvgOff * 10) / 10,
          extraMiss: Math.round(windImpact * 10) / 10,
          description: `Misses ${windImpact.toFixed(1)} extra yards in wind above 15mph`,
        },
        confidence: calculateConfidence(
          Math.min(windyShots.length, calmShots.length)
        ),
        sampleSize: windyShots.length,
      });
    }
  }

  // --- Situational: Approach from rough ---
  const roughApproaches = shots.filter(
    (s) =>
      s.lie_type === "rough" &&
      s.distance_actual != null &&
      s.distance_planned != null
  );
  const fairwayApproaches = shots.filter(
    (s) =>
      s.lie_type === "fairway" &&
      s.distance_actual != null &&
      s.distance_planned != null &&
      s.shot_number > 1
  );

  if (roughApproaches.length >= 5 && fairwayApproaches.length >= 5) {
    const roughAvgDiff = mean(
      roughApproaches.map((s) => s.distance_actual! - s.distance_planned!)
    );
    const fairwayAvgDiff = mean(
      fairwayApproaches.map((s) => s.distance_actual! - s.distance_planned!)
    );
    const roughPenalty = roughAvgDiff - fairwayAvgDiff;

    if (roughPenalty < -5) {
      tendencies.push({
        tendencyType: "situational",
        tendencyKey: "approach_from_rough",
        tendencyData: {
          roughPenalty: Math.round(Math.abs(roughPenalty)),
          description: `Loses ${Math.abs(roughPenalty).toFixed(0)} yards from rough vs fairway`,
        },
        confidence: calculateConfidence(
          Math.min(roughApproaches.length, fairwayApproaches.length)
        ),
        sampleSize: roughApproaches.length,
      });
    }
  }

  // --- Hole Type Tendencies (par 3/4/5 scoring) ---
  // Group shots by round_id + hole_number to reconstruct per-hole data
  const holeMap: Record<string, Shot[]> = {};
  for (const shot of shots) {
    const key = `${shot.round_id}_${shot.hole_number}`;
    if (!holeMap[key]) holeMap[key] = [];
    holeMap[key].push(shot);
  }

  return tendencies;
}

// ============================================================================
// HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "userId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase admin client for server-side operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all shots for this user (via rounds they own)
    const { data: shots, error: fetchError } = await supabase
      .from("round_shots")
      .select(
        "club, distance_actual, distance_planned, distance_offline, distance_to_target, wind_speed, lie_type, result, shot_number, hole_number, round_id"
      )
      .in(
        "round_id",
        supabase
          .from("rounds")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "completed")
      );

    if (fetchError) {
      // Fallback: join-based query
      const { data: rounds, error: roundsError } = await supabase
        .from("rounds")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "completed");

      if (roundsError) {
        throw new Error(`Failed to fetch rounds: ${roundsError.message}`);
      }

      if (!rounds || rounds.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            clubStats: {},
            tendencies: [],
            totalShots: 0,
            message: "No completed rounds found",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const roundIds = rounds.map((r: { id: string }) => r.id);
      const { data: fallbackShots, error: shotsError } = await supabase
        .from("round_shots")
        .select(
          "club, distance_actual, distance_planned, distance_offline, distance_to_target, wind_speed, lie_type, result, shot_number, hole_number, round_id"
        )
        .in("round_id", roundIds)
        .order("round_id")
        .order("hole_number")
        .order("shot_number");

      if (shotsError) {
        throw new Error(`Failed to fetch shots: ${shotsError.message}`);
      }

      return await processAndSave(supabase, userId, fallbackShots || []);
    }

    return await processAndSave(supabase, userId, shots || []);
  } catch (error) {
    console.error("Compute Analytics Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function processAndSave(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  shots: Shot[]
): Promise<Response> {
  if (shots.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        clubStats: {},
        tendencies: [],
        totalShots: 0,
        message: "No shots to analyze",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Compute stats
  const clubStats = computeClubStats(shots);
  const tendencies = detectTendencies(shots, clubStats);

  // Save club stats
  const clubStatsRows = Object.values(clubStats).map((stats) => ({
    user_id: userId,
    club: stats.club,
    avg_distance: stats.avgDistance,
    median_distance: stats.medianDistance,
    std_distance: stats.stdDistance,
    max_distance: stats.maxDistance,
    min_distance: stats.minDistance,
    avg_offline: stats.avgOffline,
    std_offline: stats.stdOffline,
    miss_left_pct: stats.missLeftPct,
    miss_right_pct: stats.missRightPct,
    miss_short_pct: stats.missShortPct,
    miss_long_pct: stats.missLongPct,
    dispersion_radius: stats.dispersionRadius,
    lateral_dispersion: stats.lateralDispersion,
    distance_dispersion: stats.distanceDispersion,
    avg_distance_to_target: stats.avgDistanceToTarget,
    total_shots: stats.totalShots,
    last_10_avg: stats.last10Avg,
    last_updated: new Date().toISOString(),
  }));

  if (clubStatsRows.length > 0) {
    const { error: statsError } = await supabase
      .from("user_club_stats")
      .upsert(clubStatsRows, { onConflict: "user_id,club" });

    if (statsError) {
      console.error("Error saving club stats:", statsError.message);
    }
  }

  // Save tendencies
  const tendencyRows = tendencies.map((t) => ({
    user_id: userId,
    tendency_type: t.tendencyType,
    tendency_key: t.tendencyKey,
    tendency_data: t.tendencyData,
    confidence: t.confidence,
    sample_size: t.sampleSize,
    last_updated: new Date().toISOString(),
  }));

  if (tendencyRows.length > 0) {
    const { error: tendError } = await supabase
      .from("user_tendencies")
      .upsert(tendencyRows, {
        onConflict: "user_id,tendency_type,tendency_key",
      });

    if (tendError) {
      console.error("Error saving tendencies:", tendError.message);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      clubStats: Object.keys(clubStats).length,
      tendencies: tendencies.length,
      totalShots: shots.length,
      message: `Analyzed ${shots.length} shots across ${Object.keys(clubStats).length} clubs, detected ${tendencies.length} tendencies`,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
