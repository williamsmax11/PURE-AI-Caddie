# Pure Design System

A professional, light, and sleek design framework for the Pure golf app.

## Table of Contents
- [Colors](#colors)
- [Gradients](#gradients)
- [Typography](#typography)
- [Spacing](#spacing)
- [Buttons](#buttons)
- [Cards](#cards)
- [Inputs](#inputs)
- [Golf-Specific Theme](#golf-specific-theme)

---

## Colors

### Primary Colors (Golf Green)
The primary palette is inspired by golf course greens - fresh, natural, and professional.

```javascript
import theme from './theme';

// Usage
backgroundColor: theme.colors.primary[500]  // Main brand green
backgroundColor: theme.colors.primary[50]   // Very light green background
backgroundColor: theme.colors.primary[700]  // Deep golf green
```

**Color Scale:**
- `50` - Lightest (backgrounds, highlights)
- `100-300` - Light shades (subtle backgrounds, borders)
- `400-500` - Main brand colors (buttons, primary actions)
- `600-700` - Dark shades (text, emphasis)
- `800-900` - Darkest (headers, strong emphasis)

### Secondary Colors (Sky & Earth)
Clean sky blues for secondary actions and accents.

```javascript
backgroundColor: theme.colors.secondary[500]  // Clear sky blue
```

### Accent Colors
Special purpose colors for variety and emphasis.

```javascript
theme.colors.accent.amber    // #f59e0b - Trophy/achievement gold
theme.colors.accent.orange   // #f97316 - Energy/urgency
theme.colors.accent.teal     // #14b8a6 - Water hazard
theme.colors.accent.emerald  // #10b981 - Victory/success
```

### Text Colors
Pre-configured text colors for consistency.

```javascript
color: theme.colors.text.primary    // Main text (#171717)
color: theme.colors.text.secondary  // Secondary text (#525252)
color: theme.colors.text.tertiary   // Disabled/placeholder (#a3a3a3)
color: theme.colors.text.brand      // Brand text (deep green)
color: theme.colors.text.inverse    // Text on dark backgrounds (white)
```

### Background Colors
Clean, light backgrounds for a professional feel.

```javascript
backgroundColor: theme.colors.background.light           // Main (#fafafa)
backgroundColor: theme.colors.background.white           // Cards (#ffffff)
backgroundColor: theme.colors.background.green.light     // Light green tint
```

---

## Gradients

All gradients are configured for use with `expo-linear-gradient`.

### Primary Gradient (Golf Course)
```javascript
import { LinearGradient } from 'expo-linear-gradient';
import theme from './theme';

<LinearGradient
  colors={theme.gradients.primary.colors}
  start={theme.gradients.primary.start}
  end={theme.gradients.primary.end}
  style={styles.container}
>
  {/* Your content */}
</LinearGradient>
```

### Available Gradients
- `primary` - Golf green gradient (main brand)
- `sky` - Clean, airy gradient for backgrounds
- `sunrise` - Warm gradient for achievements
- `fairway` - Natural green for course elements
- `subtle` - Very light gradient for subtle depth
- `premium` - Gold gradient for special features
- `cardOverlay` - Subtle white gradient for cards

---

## Typography

### Font Sizes
Using a modular scale for consistency:

```javascript
fontSize: theme.typography.sizes.xs      // 12
fontSize: theme.typography.sizes.sm      // 14
fontSize: theme.typography.sizes.base    // 16 (default)
fontSize: theme.typography.sizes.lg      // 18
fontSize: theme.typography.sizes.xl      // 20
fontSize: theme.typography.sizes['2xl']  // 24
fontSize: theme.typography.sizes['4xl']  // 32
fontSize: theme.typography.sizes['6xl']  // 48
```

### Font Weights
```javascript
fontWeight: theme.typography.weights.regular   // '400'
fontWeight: theme.typography.weights.medium    // '500'
fontWeight: theme.typography.weights.semibold  // '600'
fontWeight: theme.typography.weights.bold      // '700'
```

### Pre-configured Text Styles
The easiest way to use typography - complete, ready-to-use styles:

```javascript
// Headings
<Text style={theme.typography.styles.h1}>Main Heading</Text>
<Text style={theme.typography.styles.h2}>Sub Heading</Text>
<Text style={theme.typography.styles.h3}>Section Title</Text>

// Body text
<Text style={theme.typography.styles.body}>Regular paragraph text</Text>
<Text style={theme.typography.styles.bodyLarge}>Larger body text</Text>
<Text style={theme.typography.styles.bodySmall}>Smaller descriptive text</Text>

// Special text
<Text style={theme.typography.styles.label}>Form Label</Text>
<Text style={theme.typography.styles.caption}>Caption or helper text</Text>

// Display text (hero sections)
<Text style={theme.typography.styles.displayLarge}>Hero Title</Text>
```

---

## Spacing

Consistent spacing system based on 4px increments:

```javascript
margin: theme.spacing.xs      // 4
padding: theme.spacing.sm     // 8
marginBottom: theme.spacing.base  // 16 (default)
paddingVertical: theme.spacing.lg // 20
gap: theme.spacing.xl         // 24
marginTop: theme.spacing['2xl']   // 32
paddingHorizontal: theme.spacing['4xl']  // 48
```

**Quick Reference:**
- `xs` (4px) - Minimal spacing
- `sm` (8px) - Tight spacing
- `md` (12px) - Compact spacing
- `base` (16px) - Default spacing
- `lg` (20px) - Comfortable spacing
- `xl` (24px) - Generous spacing
- `2xl` (32px) - Large spacing
- `3xl` (40px) - Section spacing
- `4xl` (48px) - Major section spacing

---

## Buttons

### Using the Button Component

```javascript
import { Button } from './components';

// Primary button (default)
<Button
  title="Start Round"
  onPress={() => console.log('pressed')}
/>

// Secondary button
<Button
  title="View Stats"
  variant="secondary"
  onPress={() => {}}
/>

// Sizes
<Button title="Small" size="small" onPress={() => {}} />
<Button title="Large" size="large" onPress={() => {}} />
<Button title="Full Width" fullWidth onPress={() => {}} />

// States
<Button title="Disabled" disabled onPress={() => {}} />
```

### Manual Button Styling

```javascript
// Primary button with gradient
<TouchableOpacity style={theme.buttons.primary.base}>
  <LinearGradient
    colors={theme.buttons.primary.background.colors}
    start={theme.buttons.primary.background.start}
    end={theme.buttons.primary.background.end}
    style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
  >
    <Text style={theme.buttons.primary.text}>Click Me</Text>
  </LinearGradient>
</TouchableOpacity>

// Secondary button
<TouchableOpacity style={theme.buttons.secondary.base}>
  <Text style={theme.buttons.secondary.text}>Secondary</Text>
</TouchableOpacity>

// Icon button
<TouchableOpacity style={theme.buttons.icon.base}>
  <Text>🏌️</Text>
</TouchableOpacity>
```

---

## Cards

### Using the Card Component

```javascript
import { Card } from './components';

// Basic card
<Card>
  <Text>Card content</Text>
</Card>

// Card with title
<Card title="Recent Rounds" subtitle="Your last 5 games">
  <Text>Content here</Text>
</Card>

// Different variants
<Card variant="elevated">...</Card>
<Card variant="feature">...</Card>
<Card variant="stats">...</Card>
<Card variant="outlined">...</Card>
```

### Manual Card Styling

```javascript
// Base card
<View style={theme.cards.base}>
  <Text>Content</Text>
</View>

// Elevated card (more shadow)
<View style={theme.cards.elevated}>
  <Text>Important content</Text>
</View>

// Stats card (with colored border)
<View style={theme.cards.stats}>
  <Text style={theme.typography.styles.h3}>72</Text>
  <Text style={theme.typography.styles.bodySmall}>Average Score</Text>
</View>
```

---

## Inputs

### Using the Input Component

```javascript
import { Input } from './components';

// Basic input
<Input
  label="Player Name"
  value={name}
  onChangeText={setName}
  placeholder="Enter your name"
/>

// Input with error
<Input
  label="Handicap"
  value={handicap}
  onChangeText={setHandicap}
  keyboardType="numeric"
  error="Please enter a valid handicap"
/>

// Multiline input
<Input
  label="Round Notes"
  value={notes}
  onChangeText={setNotes}
  multiline
  numberOfLines={4}
/>
```

---

## Shadows

Professional shadow presets for depth and elevation:

```javascript
// Subtle shadow for cards
<View style={[styles.card, theme.shadows.sm]}>

// Medium shadow for elevated cards
<View style={[styles.card, theme.shadows.md]}>

// Large shadow for modals
<View style={[styles.modal, theme.shadows.lg]}>

// Colored shadow for primary elements
<View style={[styles.button, theme.shadows.primaryGlow]}>
```

---

## Border Radius

Consistent rounded corners:

```javascript
borderRadius: theme.borderRadius.sm      // 4
borderRadius: theme.borderRadius.base    // 8
borderRadius: theme.borderRadius.md      // 12
borderRadius: theme.borderRadius.lg      // 16 (recommended for cards)
borderRadius: theme.borderRadius.xl      // 20
borderRadius: theme.borderRadius.full    // 9999 (circular)
```

---

## Golf-Specific Theme

Special colors and constants for golf-related features:

### Course Elements
```javascript
backgroundColor: theme.golfTheme.course.fairway   // Fairway green
backgroundColor: theme.golfTheme.course.green     // Putting green
backgroundColor: theme.golfTheme.course.sand      // Bunker/sand
backgroundColor: theme.golfTheme.course.water     // Water hazard
```

### Score Colors
Color-code scores based on performance:

```javascript
// Dynamically color scores
const getScoreColor = (score, par) => {
  const diff = score - par;
  if (diff <= -2) return theme.golfTheme.score.eagle;
  if (diff === -1) return theme.golfTheme.score.birdie;
  if (diff === 0) return theme.golfTheme.score.par;
  if (diff === 1) return theme.golfTheme.score.bogey;
  return theme.golfTheme.score.doubleBogey;
};
```

### Club Type Colors
```javascript
color: theme.golfTheme.clubs.driver
color: theme.golfTheme.clubs.woods
color: theme.golfTheme.clubs.irons
color: theme.golfTheme.clubs.wedges
color: theme.golfTheme.clubs.putter
```

---

## Common Components

### Screen Container
```javascript
<SafeAreaView style={theme.components.screen}>
  <View style={theme.components.container}>
    {/* Your content */}
  </View>
</SafeAreaView>
```

### Divider
```javascript
<View style={theme.components.divider} />
```

### Badge
```javascript
<View style={theme.components.badge}>
  <Text style={theme.components.badgeText}>New</Text>
</View>
```

### Avatar
```javascript
<View style={theme.components.avatar.medium}>
  <Text>JD</Text>
</View>
```

---

## Best Practices

### 1. Use Pre-configured Styles
Always prefer pre-configured styles over custom values:

```javascript
// ✅ Good
<Text style={theme.typography.styles.h3}>Title</Text>

// ❌ Avoid
<Text style={{ fontSize: 24, fontWeight: '600' }}>Title</Text>
```

### 2. Consistent Spacing
Use the spacing system for all margins and padding:

```javascript
// ✅ Good
marginBottom: theme.spacing.lg

// ❌ Avoid
marginBottom: 20
```

### 3. Semantic Colors
Use semantic color names, not specific values:

```javascript
// ✅ Good
backgroundColor: theme.colors.primary[500]

// ❌ Avoid
backgroundColor: '#22c55e'
```

### 4. Component Variants
Leverage component variants instead of custom styling:

```javascript
// ✅ Good
<Card variant="elevated">

// ❌ Avoid
<Card style={{ shadowOpacity: 0.1, shadowRadius: 8 }}>
```

---

## Quick Start Example

Here's a complete screen using the design system:

```javascript
import React from 'react';
import { SafeAreaView, View, Text, ScrollView } from 'react-native';
import { Button, Card } from './components';
import theme from './theme';

const MyScreen = () => {
  return (
    <SafeAreaView style={theme.components.screen}>
      <ScrollView>
        <View style={theme.components.container}>
          {/* Header */}
          <Text style={theme.typography.styles.displayMedium}>
            Welcome Back!
          </Text>
          <Text style={[theme.typography.styles.body, { marginTop: theme.spacing.sm }]}>
            Ready for your next round?
          </Text>

          {/* Divider */}
          <View style={theme.components.divider} />

          {/* Cards */}
          <Card variant="stats" title="Current Handicap">
            <Text style={theme.typography.styles.displayLarge}>12.4</Text>
          </Card>

          <View style={{ height: theme.spacing.lg }} />

          <Card variant="elevated" title="Recent Round">
            <Text style={theme.typography.styles.body}>
              Pebble Beach - Score: 78
            </Text>
            <View style={{ height: theme.spacing.sm }} />
            <Text style={theme.typography.styles.bodySmall}>
              2 days ago
            </Text>
          </Card>

          {/* Buttons */}
          <View style={{ marginTop: theme.spacing.xl }}>
            <Button
              title="Start New Round"
              onPress={() => {}}
              fullWidth
            />
            <View style={{ height: theme.spacing.md }} />
            <Button
              title="View All Rounds"
              variant="secondary"
              onPress={() => {}}
              fullWidth
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default MyScreen;
```

---

## Support

For questions or suggestions about the design system, refer to the source files:
- `theme.js` - Main theme configuration
- `components/Button.js` - Button component examples
- `components/Card.js` - Card component examples
- `components/Input.js` - Input component examples
