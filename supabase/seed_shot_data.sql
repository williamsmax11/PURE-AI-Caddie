-- =============================================================================
-- Pure Seed Data: Shot Tracking & Analytics
-- =============================================================================
--
-- This script inserts 12 completed rounds of realistic golf data for a
-- ~15-handicap player with clear tendencies:
--   - Driver: right miss bias (~8 yards avg offline)
--   - Par 3s: weakness (+0.8 over par avg)
--   - Par 5s: strength (-0.2 under par avg)
--   - Back nine: fade (+2-3 strokes vs front)
--   - Long irons: slight left pull
--
-- BEFORE RUNNING:
--   1. Replace YOUR_USER_ID_HERE with your auth.users UUID
--   2. Replace YOUR_COURSE_ID_HERE with a valid Courses UUID
--   3. (Optional) Replace YOUR_TEE_BOX_ID_HERE or set to NULL
--
-- Data levels achieved:
--   - 12 rounds (>10 = "strong")
--   - ~210+ shots (>150 = "strong")
--   - All features unlocked
--
-- Run in Supabase SQL Editor or via psql.
-- =============================================================================

-- =============================================================================
-- PART 1: Rounds + Holes (12 rounds × 18 holes each)
-- =============================================================================
-- Round totals are computed from hole data via UPDATE after insertion.
-- =============================================================================

DO $$
DECLARE
  v_user_id   uuid := 'b316d162-b7a3-4a5d-ae38-96b90e3e87bd';
  v_course_id uuid := '7d510c97-22a1-4af5-80e3-b7047681e92b';
  v_tee_box   uuid := NULL;  -- set to YOUR_TEE_BOX_ID_HERE if you have one

  v_round_id  uuid;

  -- Course layout: par, yardage, handicap for 18 holes
  v_pars      int[] := ARRAY[4,3,5,4,4,3,4,5,4, 4,5,3,4,4,4,3,5,4];
  v_yardages  int[] := ARRAY[385,165,520,410,370,185,400,545,355, 395,510,175,425,365,440,195,530,405];
  v_handicaps int[] := ARRAY[7,15,3,1,11,13,5,9,17, 8,4,16,2,12,6,14,10,18];

  v_round_date timestamptz;
  v_weather_temp int;
  v_weather_wind int;
  v_weather_cond text;

  -- Per-hole data: [score, putts, fir_code, gir_code, penalties, drive_dist] × 18
  -- fir_code: 0=na, 1=hit, 2=left, 3=right, 4=short  |  gir: 0=no, 1=yes
  v_round_data int[];
  v_idx        int;
  v_hole_num   int;
  v_fir        text;
  v_drive_dist int;

  -- Round metadata arrays (12 rounds)
  v_dates      timestamptz[] := ARRAY[
    '2026-01-05 09:00:00-05', '2026-01-12 10:00:00-05', '2026-01-19 08:30:00-05',
    '2026-01-26 11:00:00-05', '2026-02-02 09:15:00-05', '2026-02-05 08:45:00-05',
    '2026-02-06 07:30:00-05', '2026-02-08 12:00:00-05', '2026-02-09 09:30:00-05',
    '2026-02-10 10:00:00-05', '2026-02-11 13:00:00-05', '2026-02-12 08:30:00-05'
  ];
  v_temps      int[] := ARRAY[72, 68, 75, 62, 78, 70, 80, 58, 74, 71, 76, 73];
  v_winds      int[] := ARRAY[8, 12, 5, 18, 6, 10, 4, 15, 7, 9, 8, 11];
  v_conds      text[] := ARRAY['clear','partly_cloudy','clear','overcast','clear','partly_cloudy','clear','rain','clear','partly_cloudy','clear','partly_cloudy'];

  v_r          int;

BEGIN

  FOR v_r IN 1..12 LOOP
    v_round_date   := v_dates[v_r];
    v_weather_temp := v_temps[v_r];
    v_weather_wind := v_winds[v_r];
    v_weather_cond := v_conds[v_r];

    -- Build hole data for this round
    -- Each round has specific scores encoding the player's tendencies:
    --   Front nine: ~41 avg | Back nine: ~44 avg
    --   Par 3s: score 3.8 avg | Par 5s: score 5.3 avg
    --   Driver misses right ~55% of the time
    CASE v_r
      -- Round 1: Score ~85. Solid front, fades on back.
      WHEN 1 THEN v_round_data := ARRAY[
        5,2,3,0,0,240,  3,2,0,1,0,0,    5,2,1,0,0,245,  5,2,1,0,0,235,  4,2,1,1,0,230,  4,2,0,0,0,0,    5,2,3,0,0,225,  5,2,1,1,0,250,  4,1,1,1,0,220,
        5,2,3,0,0,235,  5,2,1,0,0,248,  4,3,0,0,0,0,    5,2,1,0,0,230,  5,2,3,0,0,225,  5,2,1,0,0,240,  4,2,0,0,0,0,    5,2,1,0,0,242,  5,2,1,0,0,228
      ];
      -- Round 2: Score ~90. Windier, more misses.
      WHEN 2 THEN v_round_data := ARRAY[
        5,2,3,0,0,238,  4,2,0,0,0,0,    5,2,1,0,0,250,  5,3,1,0,0,232,  5,2,3,0,0,228,  4,2,0,0,0,0,    5,2,1,0,0,220,  5,2,1,1,0,255,  5,2,3,0,0,215,
        5,2,3,0,0,240,  6,3,3,0,0,235,  4,2,0,0,1,0,    6,2,1,0,0,225,  5,2,3,0,0,218,  5,2,1,0,0,242,  5,3,0,0,0,0,    5,2,1,0,0,248,  6,3,1,0,1,230
      ];
      -- Round 3: Score ~83. Best front nine. Low wind, good conditions.
      WHEN 3 THEN v_round_data := ARRAY[
        4,2,1,1,0,245,  3,1,0,1,0,0,    5,2,1,1,0,252,  4,1,1,1,0,240,  4,2,1,1,0,235,  3,2,0,1,0,0,    4,1,1,1,0,230,  4,1,1,1,0,258,  4,2,1,1,0,225,
        5,2,3,0,0,238,  5,2,1,1,0,250,  4,2,0,0,0,0,    5,2,1,0,0,235,  4,2,1,1,0,228,  5,2,3,0,0,242,  4,2,0,0,0,0,    5,2,1,0,0,248,  4,2,1,1,0,232
      ];
      -- Round 4: Score ~95. Tough conditions (18mph wind, overcast).
      WHEN 4 THEN v_round_data := ARRAY[
        6,2,3,0,0,230,  5,3,0,0,0,0,    6,2,2,0,0,235,  5,2,3,0,0,220,  5,2,1,0,0,225,  5,3,0,0,0,0,    6,3,3,0,0,215,  5,2,1,0,0,240,  5,2,1,0,0,210,
        6,2,3,0,1,228,  6,3,3,0,0,232,  5,3,0,0,0,0,    6,2,2,0,0,218,  5,2,1,0,0,222,  6,3,3,0,0,235,  5,3,0,0,0,0,    6,2,1,0,0,245,  5,2,3,0,0,220
      ];
      -- Round 5: Score ~86. Good conditions, solid.
      WHEN 5 THEN v_round_data := ARRAY[
        4,2,1,1,0,248,  4,2,0,0,0,0,    4,1,1,1,0,255,  5,2,3,0,0,238,  4,2,1,1,0,232,  4,2,0,0,0,0,    5,2,1,0,0,228,  5,2,1,1,0,260,  4,2,1,1,0,222,
        5,2,3,0,0,240,  5,2,1,1,0,252,  3,1,0,1,0,0,    5,2,1,0,0,232,  4,1,1,1,0,230,  5,2,3,0,0,245,  4,2,0,0,0,0,    5,2,1,0,0,250,  5,2,3,0,0,235
      ];
      -- Round 6: Score ~87. Typical round.
      WHEN 6 THEN v_round_data := ARRAY[
        5,2,3,0,0,242,  3,2,0,1,0,0,    5,2,1,0,0,248,  4,1,1,1,0,236,  5,2,3,0,0,228,  4,2,0,0,0,0,    4,2,1,1,0,225,  5,2,1,1,0,252,  4,2,1,1,0,218,
        5,2,3,0,0,238,  4,1,1,1,0,250,  4,2,0,0,0,0,    5,2,1,0,0,230,  4,2,1,1,0,225,  5,2,3,0,0,240,  4,2,0,0,0,0,    5,2,1,0,0,246,  5,2,3,0,0,228
      ];
      -- Round 7: Score ~84. Best round. Calm, warm, focused.
      WHEN 7 THEN v_round_data := ARRAY[
        4,2,1,1,0,250,  3,1,0,1,0,0,    4,1,1,1,0,260,  5,2,1,0,0,242,  4,2,1,1,0,235,  3,2,0,1,0,0,    4,1,1,1,0,232,  4,1,1,1,0,262,  4,2,1,1,0,228,
        5,2,3,0,0,245,  4,1,1,1,0,255,  3,1,0,1,0,0,    5,2,1,0,0,238,  4,2,1,1,0,232,  5,2,1,0,0,248,  4,2,0,0,0,0,    4,1,1,1,0,258,  4,2,1,1,0,235
      ];
      -- Round 8: Score ~96. Worst round. Rain, 15mph wind.
      WHEN 8 THEN v_round_data := ARRAY[
        6,3,3,0,0,225,  5,3,0,0,0,0,    6,2,2,0,0,230,  6,3,3,0,0,218,  5,2,1,0,0,220,  5,3,0,0,0,0,    6,3,3,0,0,210,  6,2,1,0,0,235,  5,2,3,0,0,208,
        6,2,3,0,1,222,  7,3,3,0,1,228,  5,3,0,0,0,0,    6,2,2,0,0,215,  5,2,1,0,0,218,  6,3,3,0,0,230,  5,3,0,0,0,0,    6,2,1,0,0,238,  6,3,3,0,1,218
      ];
      -- Round 9: Score ~87. Typical.
      WHEN 9 THEN v_round_data := ARRAY[
        5,2,3,0,0,244,  3,2,0,1,0,0,    5,2,1,0,0,250,  5,2,1,0,0,234,  4,1,1,1,0,230,  4,2,0,0,0,0,    4,2,1,1,0,226,  5,2,1,1,0,254,  4,2,1,1,0,220,
        5,2,3,0,0,238,  5,2,1,0,0,248,  4,2,0,0,0,0,    5,2,3,0,0,232,  4,2,1,1,0,228,  5,2,1,0,0,242,  4,2,0,0,0,0,    5,2,1,0,0,250,  4,2,1,1,0,230
      ];
      -- Round 10: Score ~89. Slightly above average.
      WHEN 10 THEN v_round_data := ARRAY[
        5,2,3,0,0,240,  4,2,0,0,0,0,    5,2,1,0,0,246,  5,2,1,0,0,232,  4,2,1,1,0,228,  4,2,0,0,0,0,    5,2,3,0,0,222,  5,2,1,1,0,250,  4,2,1,1,0,218,
        5,2,3,0,0,236,  5,2,1,0,0,248,  4,2,0,0,0,0,    5,2,3,0,0,228,  5,2,1,0,0,225,  5,2,1,0,0,238,  4,2,0,0,0,0,    5,2,1,0,0,252,  5,2,3,0,0,230
      ];
      -- Round 11: Score ~86. Good conditions.
      WHEN 11 THEN v_round_data := ARRAY[
        4,2,1,1,0,246,  4,2,0,0,0,0,    5,2,1,0,0,252,  4,1,1,1,0,238,  5,2,3,0,0,230,  3,2,0,1,0,0,    5,2,1,0,0,226,  4,1,1,1,0,256,  4,2,1,1,0,222,
        5,2,3,0,0,240,  5,2,1,1,0,250,  4,2,0,0,0,0,    5,2,1,0,0,234,  4,2,1,1,0,228,  5,2,3,0,0,242,  4,2,0,0,0,0,    5,2,1,0,0,248,  4,2,1,1,0,232
      ];
      -- Round 12: Score ~88. Average.
      WHEN 12 THEN v_round_data := ARRAY[
        5,2,3,0,0,242,  3,2,0,1,0,0,    5,2,1,0,0,248,  5,2,1,0,0,234,  4,2,1,1,0,230,  4,2,0,0,0,0,    5,2,3,0,0,224,  5,2,1,1,0,254,  4,2,1,1,0,220,
        5,2,3,0,0,238,  5,2,1,0,0,250,  4,2,0,0,0,0,    5,2,1,0,0,232,  5,2,3,0,0,226,  5,2,1,0,0,240,  5,3,0,0,0,0,    5,2,1,0,0,248,  4,2,1,1,0,228
      ];
    END CASE;

    -- Insert round with placeholder totals (will be computed below)
    INSERT INTO rounds (
      id, user_id, course_id, tee_box_id, status, started_at, completed_at,
      tee_color, tee_yardage, tee_rating, tee_slope, course_par,
      weather_temp_f, weather_wind_mph, weather_condition,
      holes_played
    )
    VALUES (
      gen_random_uuid(), v_user_id, v_course_id, v_tee_box, 'completed',
      v_round_date, v_round_date + interval '4 hours',
      'white', 6500, 70.5, 125, 72,
      v_weather_temp, v_weather_wind, v_weather_cond,
      18
    )
    RETURNING id INTO v_round_id;

    -- Insert all 18 holes
    FOR v_hole_num IN 1..18 LOOP
      v_idx := (v_hole_num - 1) * 6;  -- 0-based offset, PG arrays are 1-indexed so +1 below

      v_drive_dist := v_round_data[v_idx + 6];

      -- Map fir code to text
      v_fir := CASE v_round_data[v_idx + 3]
        WHEN 0 THEN 'na'
        WHEN 1 THEN 'hit'
        WHEN 2 THEN 'left'
        WHEN 3 THEN 'right'
        WHEN 4 THEN 'short'
        ELSE 'na'
      END;

      INSERT INTO round_holes (
        round_id, hole_number, score, putts, fairway_hit, gir,
        par, yardage, handicap_index, penalties, drive_distance
      )
      VALUES (
        v_round_id, v_hole_num,
        v_round_data[v_idx + 1],              -- score
        v_round_data[v_idx + 2],              -- putts
        v_fir,                                 -- fairway_hit
        v_round_data[v_idx + 4] = 1,          -- gir (boolean)
        v_pars[v_hole_num],                    -- par
        v_yardages[v_hole_num],                -- yardage
        v_handicaps[v_hole_num],               -- handicap_index
        v_round_data[v_idx + 5],              -- penalties
        NULLIF(v_drive_dist, 0)                -- drive_distance (NULL if 0)
      );
    END LOOP;

    -- Compute and update round totals from hole data
    UPDATE rounds SET
      total_score     = (SELECT SUM(score) FROM round_holes WHERE round_id = v_round_id),
      total_putts     = (SELECT SUM(putts) FROM round_holes WHERE round_id = v_round_id),
      front_nine_score = (SELECT SUM(score) FROM round_holes WHERE round_id = v_round_id AND hole_number <= 9),
      back_nine_score  = (SELECT SUM(score) FROM round_holes WHERE round_id = v_round_id AND hole_number > 9),
      fairways_hit    = (SELECT COUNT(*) FILTER (WHERE fairway_hit = 'hit') FROM round_holes WHERE round_id = v_round_id),
      fairways_total  = (SELECT COUNT(*) FILTER (WHERE fairway_hit != 'na') FROM round_holes WHERE round_id = v_round_id),
      greens_in_reg   = (SELECT COUNT(*) FILTER (WHERE gir = true) FROM round_holes WHERE round_id = v_round_id),
      greens_total    = 18,
      score_to_par    = (SELECT SUM(score) FROM round_holes WHERE round_id = v_round_id) - 72
    WHERE id = v_round_id;

    RAISE NOTICE 'Round % inserted (id: %)', v_r, v_round_id;
  END LOOP;

  RAISE NOTICE 'All 12 rounds with holes inserted successfully.';

END $$;


-- =============================================================================
-- PART 2: Insert round_shots for all 12 rounds
-- =============================================================================
-- Generates 3-5 shots per hole (non-putts) plus putts, with realistic GPS,
-- clubs, distances, and clear right-miss tendency on driver.
-- =============================================================================

DO $$
DECLARE
  v_user_id    uuid := 'b316d162-b7a3-4a5d-ae38-96b90e3e87bd';
  v_round_ids  uuid[];
  v_round_id   uuid;
  v_r          int;
  v_h          int;
  v_s          int;
  v_par        int;
  v_score      int;
  v_putts      int;
  v_yardage    int;

  -- Course pars/yardages (same as Part 1)
  v_pars       int[] := ARRAY[4,3,5,4,4,3,4,5,4, 4,5,3,4,4,4,3,5,4];
  v_yardages   int[] := ARRAY[385,165,520,410,370,185,400,545,355, 395,510,175,425,365,440,195,530,405];

  -- Base GPS (moves slightly per hole to simulate walking the course)
  v_base_lat   double precision := 33.5030;
  v_base_lon   double precision := -82.0230;
  v_hole_lat   double precision;
  v_hole_lon   double precision;

  -- Shot variables
  v_from_lat   double precision;
  v_from_lon   double precision;
  v_to_lat     double precision;
  v_to_lon     double precision;
  v_tgt_lat    double precision;
  v_tgt_lon    double precision;
  v_club       text;
  v_lie        text;
  v_result     text;
  v_quality    text;
  v_dist_act   real;
  v_dist_plan  real;
  v_dist_tgt   real;
  v_dist_off   real;
  v_num_shots  int;
  v_remaining  real;
  v_shot_count int := 0;

BEGIN

  -- Get all 12 round IDs for this user, ordered by date
  SELECT array_agg(id ORDER BY started_at)
  INTO v_round_ids
  FROM rounds
  WHERE user_id = v_user_id AND status = 'completed';

  IF v_round_ids IS NULL OR array_length(v_round_ids, 1) < 12 THEN
    RAISE EXCEPTION 'Expected 12+ rounds for user %, found %', v_user_id, COALESCE(array_length(v_round_ids, 1), 0);
  END IF;

  -- Loop through each round
  FOR v_r IN 1..12 LOOP
    v_round_id := v_round_ids[v_r];

    -- Loop through each hole
    FOR v_h IN 1..18 LOOP
      v_par     := v_pars[v_h];
      v_yardage := v_yardages[v_h];

      -- Get actual score and putts from round_holes
      SELECT score, putts INTO v_score, v_putts
      FROM round_holes
      WHERE round_id = v_round_id AND hole_number = v_h;

      -- Number of non-putt shots = score - putts
      v_num_shots := GREATEST(v_score - v_putts, 1);

      -- Base GPS for this hole (offset per hole to simulate course layout)
      v_hole_lat := v_base_lat + (v_h - 1) * 0.0015;
      v_hole_lon := v_base_lon + (v_h - 1) * 0.0008 * (CASE WHEN v_h <= 9 THEN 1 ELSE -1 END);

      v_from_lat := v_hole_lat;
      v_from_lon := v_hole_lon;
      v_remaining := v_yardage::real;

      -- Insert each non-putt shot
      FOR v_s IN 1..v_num_shots LOOP

        -- === CLUB SELECTION & SHOT SIMULATION ===

        IF v_s = 1 AND v_par >= 4 THEN
          -- TEE SHOT on par 4/5 → Driver
          v_club := 'driver';
          v_lie  := 'tee';
          v_dist_plan := LEAST(v_remaining, 245.0);
          -- Avg ~240, std ~15
          v_dist_act := 230 + (random() * 30)::real;
          -- Right miss bias: avg +8 yards, skewed right
          v_dist_off := 3 + (random() * 15 - 3)::real;
          IF v_dist_off > 12 THEN
            v_result := 'rough_right'; v_quality := 'poor';
          ELSIF v_dist_off > 5 THEN
            v_result := 'fairway'; v_quality := 'acceptable';
          ELSIF v_dist_off < -8 THEN
            v_result := 'rough_left'; v_quality := 'poor';
          ELSE
            v_result := 'fairway'; v_quality := 'good';
          END IF;

        ELSIF v_s = 1 AND v_par = 3 THEN
          -- TEE SHOT on par 3 → Iron based on yardage
          v_lie := 'tee';
          IF v_yardage > 185 THEN v_club := '4_hybrid';
          ELSIF v_yardage > 165 THEN v_club := '6_iron';
          ELSIF v_yardage > 150 THEN v_club := '7_iron';
          ELSE v_club := '8_iron';
          END IF;
          v_dist_plan := v_remaining;
          v_dist_act := v_remaining - 10 + (random() * 25)::real;
          v_dist_off := -2 + (random() * 12 - 4)::real;
          IF abs(v_dist_off) < 8 AND abs(v_dist_act - v_remaining) < 15 THEN
            v_result := 'green'; v_quality := 'good';
          ELSIF v_dist_off > 8 THEN
            v_result := 'rough_right'; v_quality := 'acceptable';
          ELSIF v_dist_off < -10 THEN
            v_result := 'bunker'; v_quality := 'poor';
          ELSE
            v_result := 'fringe'; v_quality := 'acceptable';
          END IF;

        ELSIF v_remaining > 200 THEN
          -- LONG APPROACH / LAYUP → Fairway woods
          v_lie := CASE WHEN v_s = 1 THEN 'tee' ELSE 'fairway' END;
          IF v_remaining > 250 THEN
            v_club := '3_wood'; v_dist_plan := 220.0;
            v_dist_act := 210 + (random() * 25)::real;
          ELSE
            v_club := '5_wood'; v_dist_plan := 200.0;
            v_dist_act := 190 + (random() * 25)::real;
          END IF;
          v_dist_off := -3 + (random() * 14 - 4)::real;  -- slight left pull
          v_result := CASE
            WHEN abs(v_dist_off) < 10 THEN 'fairway'
            WHEN v_dist_off > 10 THEN 'rough_right'
            ELSE 'rough_left'
          END;
          v_quality := CASE WHEN abs(v_dist_off) < 8 THEN 'good' ELSE 'acceptable' END;

        ELSIF v_remaining > 170 THEN
          -- LONG IRON → 5 iron (left pull tendency)
          v_lie := 'fairway';
          v_club := '5_iron';
          v_dist_plan := v_remaining;
          v_dist_act := v_remaining - 8 + (random() * 20)::real;
          v_dist_off := -4 + (random() * 14 - 2)::real;
          IF abs(v_dist_off) < 10 AND abs(v_dist_act - v_remaining) < 15 THEN
            v_result := 'green'; v_quality := 'good';
          ELSE
            v_result := CASE WHEN v_dist_off < -8 THEN 'rough_left' WHEN v_dist_off > 10 THEN 'rough_right' ELSE 'fringe' END;
            v_quality := 'acceptable';
          END IF;

        ELSIF v_remaining > 150 THEN
          -- MID IRON → 7 iron
          v_lie := 'fairway';
          v_club := '7_iron';
          v_dist_plan := v_remaining;
          v_dist_act := v_remaining - 5 + (random() * 16)::real;
          v_dist_off := -1 + (random() * 10 - 3)::real;
          IF abs(v_dist_off) < 10 AND abs(v_dist_act - v_remaining) < 12 THEN
            v_result := 'green'; v_quality := 'good';
          ELSE
            v_result := CASE WHEN v_dist_off > 8 THEN 'rough_right' WHEN v_dist_off < -8 THEN 'rough_left' ELSE 'fringe' END;
            v_quality := 'acceptable';
          END IF;

        ELSIF v_remaining > 130 THEN
          -- SHORT IRON → 8 iron
          v_lie := 'fairway';
          v_club := '8_iron';
          v_dist_plan := v_remaining;
          v_dist_act := v_remaining - 3 + (random() * 14)::real;
          v_dist_off := (random() * 10 - 4)::real;
          IF abs(v_dist_off) < 8 AND abs(v_dist_act - v_remaining) < 10 THEN
            v_result := 'green'; v_quality := 'good';
          ELSE
            v_result := 'fringe'; v_quality := 'acceptable';
          END IF;

        ELSIF v_remaining > 100 THEN
          -- PITCHING WEDGE
          v_lie := 'fairway';
          v_club := 'pw';
          v_dist_plan := v_remaining;
          v_dist_act := v_remaining - 2 + (random() * 12)::real;
          v_dist_off := (random() * 8 - 3)::real;
          IF abs(v_dist_off) < 8 AND abs(v_dist_act - v_remaining) < 10 THEN
            v_result := 'green'; v_quality := 'good';
          ELSE
            v_result := 'fringe'; v_quality := 'acceptable';
          END IF;

        ELSIF v_remaining > 50 THEN
          -- SAND WEDGE (pitch)
          v_lie := CASE WHEN random() > 0.5 THEN 'rough' ELSE 'fairway' END;
          v_club := 'sw';
          v_dist_plan := v_remaining;
          v_dist_act := v_remaining - 5 + (random() * 15)::real;
          v_dist_off := (random() * 10 - 5)::real;
          v_result := CASE WHEN abs(v_dist_act - v_remaining) < 10 THEN 'green' ELSE 'fringe' END;
          v_quality := CASE WHEN abs(v_dist_act - v_remaining) < 8 THEN 'good' ELSE 'acceptable' END;

        ELSE
          -- CHIP → Sand wedge
          v_lie := CASE WHEN random() > 0.6 THEN 'fringe' ELSE 'rough' END;
          v_club := 'sw';
          v_dist_plan := v_remaining;
          v_dist_act := v_remaining - 2 + (random() * 8)::real;
          v_dist_off := (random() * 6 - 3)::real;
          v_result := 'green';
          v_quality := CASE WHEN abs(v_dist_act - v_remaining) < 5 THEN 'good' ELSE 'acceptable' END;
        END IF;

        -- Calculate distance to target
        v_dist_tgt := sqrt(power(v_dist_act - v_dist_plan, 2) + power(v_dist_off, 2));

        -- GPS: move from position toward green
        -- ~1 yard ≈ 0.000009 degrees latitude
        v_to_lat := v_from_lat + (v_dist_act * 0.000009);
        v_to_lon := v_from_lon + (v_dist_off * 0.000009);
        v_tgt_lat := v_from_lat + (v_dist_plan * 0.000009);
        v_tgt_lon := v_from_lon;  -- aimed straight

        -- Insert the shot
        INSERT INTO round_shots (
          round_id, hole_number, shot_number,
          from_lat, from_lon, to_lat, to_lon,
          target_lat, target_lon,
          club, lie_type, intended_target,
          distance_actual, distance_planned, distance_to_target, distance_offline,
          wind_speed, wind_direction, temperature_f,
          result, shot_quality, detection_method
        ) VALUES (
          v_round_id, v_h, v_s,
          v_from_lat, v_from_lon, v_to_lat, v_to_lon,
          v_tgt_lat, v_tgt_lon,
          v_club, v_lie,
          CASE WHEN v_remaining < 40 THEN 'green_center'
               WHEN v_remaining < 180 THEN 'green_center'
               ELSE 'fairway_center' END,
          round(v_dist_act::numeric, 1)::real,
          round(v_dist_plan::numeric, 1)::real,
          round(v_dist_tgt::numeric, 1)::real,
          round(v_dist_off::numeric, 1)::real,
          (5 + random() * 15)::real,
          (ARRAY['N','NE','E','SE','S','SW','W','NW'])[floor(random() * 8 + 1)::int],
          (65 + random() * 20)::real,
          v_result, v_quality, 'manual'
        );

        v_shot_count := v_shot_count + 1;

        -- Update remaining distance and move from position
        v_remaining := GREATEST(v_remaining - v_dist_act, 0);
        v_from_lat := v_to_lat;
        v_from_lon := v_to_lon;

      END LOOP;  -- non-putt shots

      -- Add putts as shots (on the green)
      FOR v_s IN 1..v_putts LOOP
        -- Position on the green
        v_from_lat := v_hole_lat + v_yardage * 0.000009;
        v_from_lon := v_hole_lon + (random() * 0.00005 - 0.000025);

        INSERT INTO round_shots (
          round_id, hole_number, shot_number,
          from_lat, from_lon, to_lat, to_lon,
          target_lat, target_lon,
          club, lie_type, intended_target,
          distance_actual, distance_planned, distance_to_target, distance_offline,
          result, shot_quality, detection_method
        ) VALUES (
          v_round_id, v_h, v_num_shots + v_s,
          v_from_lat, v_from_lon,
          v_from_lat + (random() * 0.00001), v_from_lon + (random() * 0.00001),
          v_from_lat, v_from_lon,
          'putter', 'green', 'hole',
          CASE WHEN v_s = v_putts THEN 0 ELSE (5 + random() * 25)::real END,
          CASE WHEN v_s = 1 THEN (10 + random() * 30)::real ELSE (3 + random() * 8)::real END,
          CASE WHEN v_s = v_putts THEN 0 ELSE (2 + random() * 8)::real END,
          0,
          'green',
          CASE WHEN v_s = v_putts THEN 'good' ELSE 'acceptable' END,
          'manual'
        );

        v_shot_count := v_shot_count + 1;
      END LOOP;  -- putts

    END LOOP;  -- holes
  END LOOP;  -- rounds

  RAISE NOTICE 'Inserted % total shots across 12 rounds', v_shot_count;

END $$;


-- =============================================================================
-- PART 3: Pre-computed user_club_stats
-- =============================================================================
-- These are the analytics normally computed by shotAnalyticsService after round
-- submission. Inserted directly so all features unlock immediately.
-- =============================================================================

DO $$
DECLARE
  v_user_id uuid := 'b316d162-b7a3-4a5d-ae38-96b90e3e87bd';
BEGIN

  -- Driver: 240 avg, RIGHT MISS BIAS (+8 yards avg offline)
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, 'driver', 240.2, 242.0, 14.8, 262.0, 208.0,
    8.2, 9.5, 0.15, 0.55, 0.18, 0.12,
    28.5, 18.2, 22.0, 15.8, 144, 243.5);

  -- 3 Wood: 218 avg, slight left pull
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, '3_wood', 218.5, 220.0, 12.3, 242.0, 195.0,
    -3.5, 8.2, 0.42, 0.28, 0.20, 0.10,
    22.0, 14.5, 16.8, 12.5, 36, 221.0);

  -- 5 Wood: 200 avg
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, '5_wood', 200.3, 202.0, 11.0, 225.0, 180.0,
    -2.8, 7.8, 0.38, 0.30, 0.22, 0.10,
    20.5, 13.0, 15.2, 11.8, 24, 203.0);

  -- 4 Hybrid: 185 avg
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, '4_hybrid', 185.0, 186.0, 10.2, 205.0, 165.0,
    -2.0, 7.5, 0.35, 0.30, 0.25, 0.10,
    18.8, 12.5, 14.0, 11.0, 18, 187.0);

  -- 5 Iron: 175 avg, LEFT PULL tendency
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, '5_iron', 175.2, 176.0, 9.8, 195.0, 158.0,
    -4.5, 8.0, 0.45, 0.22, 0.23, 0.10,
    18.0, 12.8, 13.5, 12.0, 30, 177.0);

  -- 6 Iron: 163 avg
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, '6_iron', 163.0, 164.0, 8.5, 180.0, 148.0,
    -2.2, 7.0, 0.38, 0.28, 0.24, 0.10,
    16.5, 11.5, 12.0, 10.5, 24, 165.0);

  -- 7 Iron: 152 avg (bread and butter club, most accurate)
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, '7_iron', 152.0, 153.0, 7.2, 168.0, 138.0,
    -0.8, 6.2, 0.32, 0.30, 0.25, 0.13,
    14.2, 10.0, 10.5, 8.8, 42, 154.0);

  -- 8 Iron: 140 avg
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, '8_iron', 140.5, 141.0, 6.8, 155.0, 128.0,
    0.5, 5.8, 0.30, 0.32, 0.26, 0.12,
    12.8, 9.2, 9.5, 8.0, 36, 142.0);

  -- 9 Iron: 128 avg
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, '9_iron', 128.0, 129.0, 6.0, 142.0, 116.0,
    0.3, 5.5, 0.30, 0.30, 0.28, 0.12,
    11.5, 8.5, 8.8, 7.2, 18, 130.0);

  -- PW: 115 avg
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, 'pw', 115.0, 116.0, 5.5, 128.0, 104.0,
    0.2, 5.0, 0.28, 0.28, 0.30, 0.14,
    10.5, 7.8, 8.0, 6.5, 30, 117.0);

  -- GW: 100 avg
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, 'gw', 100.0, 101.0, 5.0, 112.0, 90.0,
    0.0, 4.5, 0.28, 0.28, 0.30, 0.14,
    9.5, 7.0, 7.2, 6.0, 12, 102.0);

  -- SW: 78 avg (includes chips and bunker shots)
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, 'sw', 78.0, 80.0, 8.5, 95.0, 15.0,
    -0.5, 5.2, 0.30, 0.28, 0.32, 0.10,
    12.0, 8.0, 9.0, 7.5, 48, 80.0);

  -- Putter: tracked for completeness
  INSERT INTO user_club_stats (user_id, club, avg_distance, median_distance, std_distance, max_distance, min_distance,
    avg_offline, std_offline, miss_left_pct, miss_right_pct, miss_short_pct, miss_long_pct,
    dispersion_radius, lateral_dispersion, distance_dispersion, avg_distance_to_target, total_shots, last_10_avg)
  VALUES (v_user_id, 'putter', 18.0, 15.0, 10.5, 45.0, 2.0,
    0.0, 1.5, 0.25, 0.25, 0.35, 0.15,
    4.0, 2.0, 3.5, 3.0, 420, 17.0);

  RAISE NOTICE 'Inserted club stats for 13 clubs';

END $$;


-- =============================================================================
-- PART 4: Pre-computed user_tendencies
-- =============================================================================
-- Encodes the player's patterns that drive personalized recommendations.
-- 18 tendencies across 5 categories.
-- =============================================================================

DO $$
DECLARE
  v_user_id uuid := 'b316d162-b7a3-4a5d-ae38-96b90e3e87bd';
BEGIN

  -- ===== CLUB BIAS tendencies =====

  INSERT INTO user_tendencies (user_id, tendency_type, tendency_key, tendency_data, confidence, sample_size)
  VALUES
    -- Driver pushes/fades right consistently
    (v_user_id, 'club_bias', 'driver_miss',
     '{"direction": "right", "avg_offline": 8.2, "std_offline": 9.5, "description": "Consistent push/fade right with driver"}'::jsonb,
     0.88, 144),

    -- Long irons pull left
    (v_user_id, 'club_bias', 'long_iron_miss',
     '{"direction": "left", "avg_offline": -4.5, "clubs": ["5_iron", "4_hybrid"], "description": "Pulls long irons slightly left"}'::jsonb,
     0.72, 48),

    -- Short irons are reliable
    (v_user_id, 'club_bias', 'short_iron_accuracy',
     '{"avg_gir_pct": 0.62, "clubs": ["7_iron", "8_iron", "9_iron"], "description": "Reliable from 130-165 yards"}'::jsonb,
     0.80, 96);

  -- ===== HOLE TYPE tendencies =====

  INSERT INTO user_tendencies (user_id, tendency_type, tendency_key, tendency_data, confidence, sample_size)
  VALUES
    -- Par 3 weakness
    (v_user_id, 'hole_type', 'par3_scoring',
     '{"avg_over_par": 0.82, "avg_score": 3.82, "gir_pct": 0.35, "description": "Struggles on par 3s, often misses green"}'::jsonb,
     0.78, 48),

    -- Par 4 average
    (v_user_id, 'hole_type', 'par4_scoring',
     '{"avg_over_par": 0.92, "avg_score": 4.92, "gir_pct": 0.33, "description": "Slightly above average bogey rate on par 4s"}'::jsonb,
     0.82, 120),

    -- Par 5 strength
    (v_user_id, 'hole_type', 'par5_scoring',
     '{"avg_over_par": 0.42, "avg_score": 5.42, "birdie_pct": 0.08, "description": "Strength - consistent pars and occasional birdies on par 5s"}'::jsonb,
     0.75, 48);

  -- ===== DISTANCE RANGE tendencies =====

  INSERT INTO user_tendencies (user_id, tendency_type, tendency_key, tendency_data, confidence, sample_size)
  VALUES
    (v_user_id, 'distance_range', '100_125',
     '{"gir_pct": 0.68, "avg_proximity": 22.5, "description": "Strong from 100-125 yards"}'::jsonb,
     0.72, 30),

    (v_user_id, 'distance_range', '125_150',
     '{"gir_pct": 0.55, "avg_proximity": 28.0, "description": "Solid from 125-150 yards"}'::jsonb,
     0.70, 42),

    (v_user_id, 'distance_range', '150_175',
     '{"gir_pct": 0.38, "avg_proximity": 35.0, "description": "GIR drops off from 150-175"}'::jsonb,
     0.68, 36),

    (v_user_id, 'distance_range', '175_200',
     '{"gir_pct": 0.22, "avg_proximity": 42.0, "description": "Low GIR from 175-200, consider laying up"}'::jsonb,
     0.62, 24),

    (v_user_id, 'distance_range', '200_plus',
     '{"gir_pct": 0.12, "avg_proximity": 55.0, "description": "Very low GIR from 200+, definitely lay up"}'::jsonb,
     0.58, 18);

  -- ===== CONDITION tendencies =====

  INSERT INTO user_tendencies (user_id, tendency_type, tendency_key, tendency_data, confidence, sample_size)
  VALUES
    (v_user_id, 'condition', 'wind_over_15',
     '{"avg_score_impact": 1.5, "extra_strokes_per_round": 4.5, "description": "Scores 4-5 strokes worse in winds over 15mph"}'::jsonb,
     0.65, 36),

    (v_user_id, 'condition', 'rain_impact',
     '{"avg_score_impact": 2.0, "extra_strokes_per_round": 7.0, "description": "Rain adds 5-7 strokes, struggles with wet conditions"}'::jsonb,
     0.55, 18);

  -- ===== SCORING tendencies =====

  INSERT INTO user_tendencies (user_id, tendency_type, tendency_key, tendency_data, confidence, sample_size)
  VALUES
    -- Back nine fade
    (v_user_id, 'scoring', 'front_vs_back',
     '{"front_avg": 42.2, "back_avg": 45.8, "diff": 3.6, "description": "Averages 3.6 strokes worse on the back nine"}'::jsonb,
     0.82, 12),

    -- Bogey begets bogey
    (v_user_id, 'scoring', 'after_bogey',
     '{"bogey_follow_bogey_pct": 0.58, "bogey_follow_par_pct": 0.32, "description": "58% chance of another bogey after making bogey"}'::jsonb,
     0.70, 85),

    -- Closing hole fade
    (v_user_id, 'scoring', 'closing_holes',
     '{"avg_16_17_18": 5.2, "description": "Tends to fade on closing holes, avg 5.2 per hole on 16-18"}'::jsonb,
     0.68, 36);

  -- ===== SITUATIONAL tendencies =====

  INSERT INTO user_tendencies (user_id, tendency_type, tendency_key, tendency_data, confidence, sample_size)
  VALUES
    (v_user_id, 'situational', 'approach_from_rough',
     '{"distance_loss_pct": 0.12, "avg_yards_lost": 15, "description": "Loses ~15 yards from rough vs fairway on approach shots"}'::jsonb,
     0.72, 42),

    (v_user_id, 'situational', 'bunker_save_pct',
     '{"save_pct": 0.28, "avg_proximity_from_bunker": 18.5, "description": "Saves 28% from greenside bunkers"}'::jsonb,
     0.65, 25),

    (v_user_id, 'situational', 'up_and_down_pct',
     '{"overall_pct": 0.35, "from_fringe_pct": 0.52, "from_rough_pct": 0.25, "description": "35% up-and-down rate overall, better from fringe"}'::jsonb,
     0.75, 65);

  RAISE NOTICE 'Inserted 18 player tendencies';

END $$;


-- =============================================================================
-- VERIFICATION QUERIES (uncomment and run to check)
-- =============================================================================

-- Check round counts and scores:
-- SELECT count(*) as rounds,
--        avg(total_score)::numeric(4,1) as avg_score,
--        min(total_score) as best,
--        max(total_score) as worst,
--        avg(front_nine_score)::numeric(4,1) as front_avg,
--        avg(back_nine_score)::numeric(4,1) as back_avg
-- FROM rounds
-- WHERE user_id = 'YOUR_USER_ID_HERE' AND status = 'completed';

-- Check shot counts per club:
-- SELECT club, count(*) as shots,
--        avg(distance_actual)::numeric(5,1) as avg_dist,
--        avg(distance_offline)::numeric(4,1) as avg_offline
-- FROM round_shots rs
-- JOIN rounds r ON rs.round_id = r.id
-- WHERE r.user_id = 'YOUR_USER_ID_HERE'
-- GROUP BY club ORDER BY avg_dist DESC;

-- Check data level qualification:
-- SELECT
--   (SELECT count(*) FROM rounds WHERE user_id = 'YOUR_USER_ID_HERE' AND status = 'completed') as total_rounds,
--   (SELECT sum(total_shots) FROM user_club_stats WHERE user_id = 'YOUR_USER_ID_HERE') as total_tracked_shots,
--   (SELECT count(*) FROM round_shots rs JOIN rounds r ON rs.round_id = r.id WHERE r.user_id = 'YOUR_USER_ID_HERE') as total_raw_shots,
--   CASE
--     WHEN (SELECT count(*) FROM rounds WHERE user_id = 'YOUR_USER_ID_HERE' AND status = 'completed') >= 10 THEN 'strong'
--     WHEN (SELECT count(*) FROM rounds WHERE user_id = 'YOUR_USER_ID_HERE' AND status = 'completed') >= 4 THEN 'moderate'
--     WHEN (SELECT count(*) FROM rounds WHERE user_id = 'YOUR_USER_ID_HERE' AND status = 'completed') >= 1 THEN 'minimal'
--     ELSE 'none'
--   END as data_level;

-- Check tendencies:
-- SELECT tendency_type, tendency_key, confidence, sample_size
-- FROM user_tendencies WHERE user_id = 'YOUR_USER_ID_HERE'
-- ORDER BY tendency_type, confidence DESC;

-- Check club stats:
-- SELECT club, avg_distance, avg_offline, total_shots, dispersion_radius
-- FROM user_club_stats WHERE user_id = 'YOUR_USER_ID_HERE'
-- ORDER BY avg_distance DESC;
