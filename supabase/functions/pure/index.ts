import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// Static system prompt that can be cached (doesn't change between requests)
const CACHED_SYSTEM_PROMPT = `You are an elite PGA Tour caddie. Be direct, confident, and strategic.

## KEY RULES
1. Use the EFFECTIVE distance - adjustments already computed
2. Never recommend partial swings - pick the right club
3. Take MORE club when unsure - amateurs are almost always short
4. Avoid short-siding - miss to the safe side of the pin
5. Use player's ACTUAL club distances - never override their numbers

## SHOT PLAN JSON FORMAT
When planning shots, include:
\`\`\`json
{
  "shotPlan": {
    "shots": [{
      "shotNumber": 1,
      "club": "Club Name",
      "distance": 000,
      "landingZone": { "latitude": 00.000, "longitude": -00.000, "description": "..." },
      "target": "Visual aiming point",
      "reasoning": "Brief explanation",
      "nextShotDistance": 000,
      "warnings": ["..."],
      "confidence": "high|medium|low"
    }],
    "overallStrategy": "...",
    "keyConsiderations": ["..."],
    "mindset": "aggressive|conservative|smart-aggressive",
    "targetScore": "birdie|par|bogey"
  }
}
\`\`\``;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface Polygon {
  type: string;
  label: string;
  coordinates: Coordinate[];
}

interface CaddiePreferences {
  responseDepth?: "short" | "medium" | "detailed";
  bestArea?: string;
  worstArea?: string;
  planningStyle?: "fun" | "some" | "detailed";
}

interface PreCalculatedContext {
  baseDistance: number;
  effectiveDistance: number;
  adjustments: {
    wind: {
      adjustedDistance: number;
      distanceEffect: number;
      windEffect: string;
      clubAdjustment: number;
      aimOffsetYards: number;
      aimDirection: string | null;
      description: string;
    };
    temperature: {
      adjustedDistance: number;
      distanceEffect: number;
      percentChange: number;
      description: string;
    };
    elevation: {
      adjustedDistance: number;
      elevationDelta: number;
      slopeEffect: number;
      altitudeEffect: number;
      description: string;
    };
  };
  club: {
    primary: {
      club: string;
      distance: number;
      gap: number;
      confidence: string;
      note?: string;
    } | null;
    alternate: {
      club: string;
      distance: number;
      gap: number;
      note?: string;
    } | null;
    description: string;
    lieAdjustment: string | null;
  };
  hazards: {
    relevantHazards: Array<{
      name: string;
      type: string;
      distance: number;
      bearing: number;
      threatLevel: string;
      position: string;
      avoidanceNote: string;
      sideOfTarget: string;
    }>;
    filteredOut: Array<{ name: string; reason: string }>;
    summary: string;
  };
  awkwardDistance: {
    isAwkward: boolean;
    distanceAfterShot: number;
    problem?: string;
    idealDistance?: number;
    recommendation?: string;
    description: string;
  };
  fairwayTargets?: Array<{
    label: string;
    distanceFromTee: number;
    distanceToGreen: number;
    centroid: { latitude: number; longitude: number };
  }>;
  summary: string;
}

interface RequestPayload {
  mode: "chat" | "plan";
  userMessage: string | null;
  hole: {
    number: number;
    par: number;
    yardage: number;
    handicap: number;
  };
  player: {
    currentPosition: Coordinate;
    distanceToGreen: number;
    distanceFromTee: number;
    lieType?: string;
  };
  geography: {
    teeBox: Coordinate;
    green: Coordinate;
    greenFront?: Coordinate;
    greenBack?: Coordinate;
    polygons: Polygon[];
  };
  clubDistances: Record<string, number>;
  weather: {
    temperature: number;
    windSpeed: number;
    windDirection: string;
    humidity: number;
    conditions: string;
  };
  conversationHistory: Array<{ role: string; content: string }>;
  caddiePreferences?: CaddiePreferences;
  preCalculated?: PreCalculatedContext;
  playerProfile?: PlayerProfile;
}

interface PlayerProfile {
  dataLevel: "none" | "minimal" | "moderate" | "strong";
  clubStats?: Record<
    string,
    {
      avgDistance: number;
      medianDistance: number;
      avgOffline: number | null;
      missLeftPct: number;
      missRightPct: number;
      missShortPct: number;
      missLongPct: number;
      dispersionRadius: number | null;
      totalShots: number;
    }
  >;
  tendencies?: Array<{
    type: string;
    key: string;
    data: Record<string, unknown>;
    confidence: number;
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "AI service not configured",
        message: "I'm currently offline. Please try again later.",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const payload = await req.json();
    const { mode, userMessage, hole, player, clubDistances, weather, conversationHistory, caddiePreferences, preCalculated, playerProfile } = payload;
    const isStreaming = payload.stream === true;

    const systemPrompt = buildSystemPrompt(hole, player, clubDistances, weather, caddiePreferences, preCalculated, playerProfile);
    const messages = buildMessages(mode, userMessage, conversationHistory, player, caddiePreferences);

    if (isStreaming) {
      // === STREAMING PATH ===
      const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 2048,
          stream: true,
          system: [
            {
              type: "text",
              text: CACHED_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: systemPrompt,
            },
          ],
          messages: messages,
        }),
      });

      if (!anthropicResponse.ok) {
        const errorText = await anthropicResponse.text();
        console.error("Claude API streaming error:", anthropicResponse.status, errorText);
        throw new Error(`Claude API error: ${anthropicResponse.status}`);
      }

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const emit = (event: string, data: object) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };

          emit("message_start", {});

          let fullText = "";
          let inJsonBlock = false;
          let jsonBuffer = "";
          let textBuffer = "";
          const reader = anthropicResponse.body!.getReader();
          const decoder = new TextDecoder();
          let sseBuffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              sseBuffer += decoder.decode(value, { stream: true });
              const sseEvents = sseBuffer.split("\n\n");
              sseBuffer = sseEvents.pop() || "";

              for (const sseEvent of sseEvents) {
                if (!sseEvent.trim()) continue;

                // Parse Anthropic SSE event
                const dataMatch = sseEvent.match(/^data: (.+)$/m);
                if (!dataMatch) continue;

                let eventData;
                try {
                  eventData = JSON.parse(dataMatch[1]);
                } catch {
                  continue;
                }

                // Extract text delta
                if (eventData.type === "content_block_delta" && eventData.delta?.type === "text_delta") {
                  const chunk = eventData.delta.text;
                  fullText += chunk;

                  // Detect JSON block boundaries
                  if (!inJsonBlock) {
                    textBuffer += chunk;
                    // Check if we've entered a JSON code block
                    const jsonStart = textBuffer.indexOf("```json");
                    if (jsonStart !== -1) {
                      // Emit any text before the JSON block
                      const preJson = textBuffer.substring(0, jsonStart).trim();
                      if (preJson) {
                        emit("text", { text: preJson });
                      }
                      inJsonBlock = true;
                      jsonBuffer = textBuffer.substring(jsonStart + 7); // after ```json
                      textBuffer = "";
                    } else {
                      // Stream text in chunks (when we have a sentence or enough text)
                      const lastPeriod = textBuffer.lastIndexOf(". ");
                      if (lastPeriod > 20) {
                        emit("text", { text: textBuffer.substring(0, lastPeriod + 1) });
                        textBuffer = textBuffer.substring(lastPeriod + 1);
                      }
                    }
                  } else {
                    jsonBuffer += chunk;
                    // Check for closing code block
                    const jsonEnd = jsonBuffer.indexOf("```");
                    if (jsonEnd !== -1) {
                      const rawJson = jsonBuffer.substring(0, jsonEnd).trim();
                      inJsonBlock = false;
                      textBuffer = jsonBuffer.substring(jsonEnd + 3);

                      // Parse the JSON and emit structured events
                      try {
                        const parsed = JSON.parse(rawJson);
                        if (parsed.shotPlan) {
                          // Emit each shot individually
                          if (parsed.shotPlan.shots) {
                            for (const shot of parsed.shotPlan.shots) {
                              emit("shot", shot);
                            }
                          }
                          // Emit plan metadata
                          const { shots, ...meta } = parsed.shotPlan;
                          emit("plan_meta", meta);
                        }
                      } catch (e) {
                        console.warn("Failed to parse streamed JSON:", e);
                        emit("text", { text: rawJson });
                      }
                      jsonBuffer = "";
                    }
                  }
                }
              }
            }

            // Flush remaining text
            if (textBuffer.trim()) {
              emit("text", { text: textBuffer.trim() });
            }

            emit("done", {});
          } catch (e) {
            emit("error", { message: e.message || "Stream processing failed" });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // === NON-STREAMING PATH (original) ===
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: [
          {
            type: "text",
            text: CACHED_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: systemPrompt,
          },
        ],
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const claudeResponse = await response.json();
    const aiContent = claudeResponse.content[0].text;

    const parsedResponse = parseAIResponse(mode, aiContent);

    return new Response(JSON.stringify(parsedResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Pure Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        message: "I had trouble processing that. Please try again.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function formatClubName(club: string): string {
  return club
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// NOTE: calculateCentroid and calculateDistanceYards removed - now computed client-side

function buildSystemPrompt(
  hole: RequestPayload["hole"],
  player: RequestPayload["player"],
  clubDistances: Record<string, number>,
  weather: RequestPayload["weather"],
  caddiePreferences?: CaddiePreferences,
  preCalculated?: PreCalculatedContext,
  playerProfile?: PlayerProfile
): string {
  // Use pre-calculated fairway targets from client (no more server-side calculation)
  const fairwayTargetsList = preCalculated?.fairwayTargets?.length > 0
    ? preCalculated.fairwayTargets.map((f: { label: string; distanceFromTee: number; distanceToGreen: number }) =>
        `- ${f.label}: ${f.distanceFromTee} yards from tee, ${f.distanceToGreen} yards to green`
      ).join("\n")
    : "- No fairway targets mapped";

  const clubList = Object.entries(clubDistances)
    .sort((a, b) => b[1] - a[1])
    .map(([club, dist]) => `- ${formatClubName(club)}: ${dist} yards`)
    .join("\n");

  // Build dynamic context (static rules are in CACHED_SYSTEM_PROMPT)
  return `## Hole ${hole.number} (Par ${hole.par}, ${hole.yardage} yards)
Handicap: ${hole.handicap} (${hole.handicap <= 6 ? "tough hole - play smart" : hole.handicap <= 12 ? "medium difficulty" : "scoring opportunity"})

## Player Position
- **${player.distanceToGreen} yards to green** (${player.lieType || "fairway"} lie)
- ${player.distanceFromTee} yards from tee

## Conditions
${weather.temperature}°F | ${weather.windSpeed} mph ${weather.windDirection} | ${weather.conditions}

${preCalculated ? `## PRE-CALCULATED ADJUSTMENTS (USE THESE!)
**Effective Distance: ${preCalculated.effectiveDistance} yards** (base: ${preCalculated.baseDistance})
${preCalculated.adjustments.wind.distanceEffect !== 0 ? `- Wind: ${preCalculated.adjustments.wind.distanceEffect > 0 ? '+' : ''}${preCalculated.adjustments.wind.distanceEffect} yds` : ''}
${preCalculated.adjustments.wind.aimOffsetYards >= 3 ? `- Aim ${preCalculated.adjustments.wind.aimOffsetYards} yds ${preCalculated.adjustments.wind.aimDirection} for crosswind` : ''}
${preCalculated.adjustments.temperature.distanceEffect !== 0 ? `- Temp: ${preCalculated.adjustments.temperature.distanceEffect > 0 ? '+' : ''}${preCalculated.adjustments.temperature.distanceEffect} yds` : ''}
${preCalculated.adjustments.elevation.slopeEffect !== 0 ? `- Elevation: ${preCalculated.adjustments.elevation.slopeEffect > 0 ? '+' : ''}${preCalculated.adjustments.elevation.slopeEffect} yds` : ''}

**Club: ${preCalculated.club.primary ? `${formatClubName(preCalculated.club.primary.club)} (${preCalculated.club.primary.distance} yds)` : 'Select based on effective distance'}**
${preCalculated.club.alternate ? `Alt: ${formatClubName(preCalculated.club.alternate.club)} (${preCalculated.club.alternate.distance} yds)` : ''}
${preCalculated.awkwardDistance?.isAwkward ? `\n⚠️ AWKWARD DISTANCE: ${preCalculated.awkwardDistance.problem}` : ''}
` : ''}

## Hazards
${preCalculated?.hazards?.relevantHazards?.length > 0
  ? preCalculated.hazards.relevantHazards.map((h: { type: string; name: string; distance: number; threatLevel: string }) =>
      `- ${h.type.toUpperCase()}: ${h.name} at ${h.distance} yds (${h.threatLevel})`
    ).join('\n')
  : '- No hazards in play'}
${preCalculated?.hazards?.summary ? `\n${preCalculated.hazards.summary}` : ''}

## Fairway Targets
${fairwayTargetsList}

## Player's Clubs
${clubList}

${caddiePreferences?.bestArea ? `**Strength**: ${caddiePreferences.bestArea.replace(/_/g, ' ')}` : ''}
${caddiePreferences?.worstArea ? `**Avoid situations requiring**: ${caddiePreferences.worstArea.replace(/_/g, ' ')}` : ''}

${playerProfile && playerProfile.dataLevel !== 'none' ? buildPlayerProfileSection(playerProfile) : ''}

## Response Style
${getResponseLengthInstructions(caddiePreferences?.responseDepth)}`;
}

function buildPlayerProfileSection(profile: PlayerProfile): string {
  const parts: string[] = [];
  parts.push(`## Player Profile (${profile.dataLevel} data - ${profile.dataLevel === 'strong' ? 'PERSONALIZE recommendations' : 'use as supplementary info'})`);

  // Club stats summary
  if (profile.clubStats) {
    const clubLines: string[] = [];
    for (const [club, stats] of Object.entries(profile.clubStats)) {
      if (stats.totalShots < 5) continue;
      let line = `- ${formatClubName(club)}: avg ${Math.round(stats.avgDistance)}y (${stats.totalShots} shots)`;
      if (stats.avgOffline != null && Math.abs(stats.avgOffline) > 3) {
        const dir = stats.avgOffline > 0 ? 'right' : 'left';
        line += `, misses ${Math.abs(stats.avgOffline).toFixed(1)}y ${dir}`;
      }
      if (stats.dispersionRadius) {
        line += `, ${stats.dispersionRadius}y dispersion`;
      }
      clubLines.push(line);
    }
    if (clubLines.length > 0) {
      parts.push('**Measured Club Performance:**');
      parts.push(clubLines.join('\n'));
    }
  }

  // Key tendencies
  if (profile.tendencies && profile.tendencies.length > 0) {
    const highConfidence = profile.tendencies.filter(t => t.confidence >= 0.5);
    if (highConfidence.length > 0) {
      parts.push('\n**Player Tendencies (adjust recommendations accordingly):**');
      for (const t of highConfidence.slice(0, 8)) {
        const desc = (t.data as Record<string, string>)?.description || `${t.type}: ${t.key}`;
        parts.push(`- ${desc} (${Math.round(t.confidence * 100)}% confidence)`);
      }
    }
  }

  if (profile.dataLevel === 'strong') {
    parts.push('\n**IMPORTANT:** Use this player data to personalize your recommendations. Adjust aim points for their miss patterns, use their ACTUAL distances (not entered), and reference their tendencies in your advice.');
  }

  return parts.join('\n');
}

function getResponseLengthInstructions(responseDepth?: string): string {
  switch (responseDepth) {
    case 'short':
      return `**CRITICAL: User wants QUICK TIPS only.**
- Keep ALL text responses to 1-2 sentences MAX
- No lengthy explanations or reasoning
- Lead with the action: "Driver, aim left of bunker" or "8-iron to center green"
- Skip the "why" unless asked - just tell them WHAT to do
- For shot plans: Include the JSON with full data, but keep any accompanying text to ONE brief sentence
- Example good response: "Driver down the left side. Leaves 145 to the pin."
- Example bad response: "Looking at this hole, I'd recommend hitting driver here because..."`;

    case 'medium':
      return `**User wants BALANCED advice.**
- Keep responses to 2-4 sentences
- Lead with the recommendation, then add ONE key reason
- Include important warnings but don't over-explain
- For shot plans: Include the JSON, plus a brief strategic summary
- Example: "Driver down the left side, aim at the left edge of the bunker. This keeps you away from the water right and sets up a short iron in. Watch out for the fairway bunker at 240."`;

    case 'detailed':
    default:
      return `**User wants COMPREHENSIVE analysis.**
- Full strategic breakdowns are welcome
- Explain the reasoning behind recommendations
- Include alternative strategies and what-ifs
- Discuss course management principles
- For shot plans: Include detailed JSON plus full caddie commentary`;
  }
}

function buildMessages(
  mode: "chat" | "plan",
  userMessage: string | null,
  conversationHistory: Array<{ role: string; content: string }>,
  player: RequestPayload["player"],
  caddiePreferences?: CaddiePreferences
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  // Add conversation history for context
  for (const msg of conversationHistory.slice(-6)) {
    messages.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    });
  }

  if (mode === "plan") {
    // Adjust the planning request based on response depth preference
    const responseDepth = caddiePreferences?.responseDepth || 'detailed';

    let planPrompt = `Plan my shots for this hole. I'm ${player.distanceToGreen} yards from the green.

IMPORTANT: Output the JSON shot plan FIRST, then any text explanation AFTER.

`;

    if (responseDepth === 'short') {
      planPrompt += `Keep it brief - just the JSON plan and ONE sentence summary. No lengthy explanations.`;
    } else if (responseDepth === 'medium') {
      planPrompt += `Include the JSON plan, then a brief 2-3 sentence strategy summary.`;
    } else {
      planPrompt += `Include the full JSON plan with complete shot-by-shot recommendations, then your detailed caddie commentary.`;
    }

    messages.push({
      role: "user",
      content: planPrompt,
    });
  } else if (userMessage) {
    messages.push({
      role: "user",
      content: userMessage,
    });
  }

  return messages;
}

function parseAIResponse(mode: "chat" | "plan", aiContent: string): object {
  let shotPlan = null;

  // Try to extract JSON from the response
  const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.shotPlan) {
        shotPlan = parsed.shotPlan;
      }
    } catch (e) {
      console.warn("Failed to parse shot plan JSON:", e);
    }
  }

  // Also try to find JSON without code blocks
  if (!shotPlan) {
    const jsonObjectMatch = aiContent.match(/\{[\s\S]*"shotPlan"[\s\S]*\}/);
    if (jsonObjectMatch) {
      try {
        const parsed = JSON.parse(jsonObjectMatch[0]);
        if (parsed.shotPlan) {
          shotPlan = parsed.shotPlan;
        }
      } catch (e) {
        // Ignore parse errors for inline JSON
      }
    }
  }

  // Clean up the message by removing the JSON block for display
  let message = aiContent;
  if (jsonMatch) {
    message = aiContent.replace(/```json\s*[\s\S]*?\s*```/, "").trim();
  }

  return {
    success: true,
    message: message || (mode === "plan" ? "Here's your shot plan for this hole." : null),
    shotPlan,
  };
}
