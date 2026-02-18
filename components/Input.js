import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import theme from '../theme';

/**
 * Reusable Input Component
 * Usage examples at the bottom of this file
 */
const Input = ({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  multiline = false,
  numberOfLines = 1,
  keyboardType = 'default',
  secureTextEntry = false,
  style,
  ...otherProps
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[theme.inputs.base.container, style]}>
      {label && (
        <Text style={theme.inputs.base.label}>{label}</Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.text.tertiary}
        multiline={multiline}
        numberOfLines={numberOfLines}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={[
          theme.inputs.base.input,
          isFocused && theme.inputs.base.inputFocused,
          error && theme.inputs.base.error,
          multiline && { height: numberOfLines * 40, textAlignVertical: 'top' },
        ]}
        {...otherProps}
      />
      {error && (
        <Text style={theme.inputs.base.errorText}>{error}</Text>
      )}
    </View>
  );
};

export default Input;

/**
 * USAGE EXAMPLES:
 *
 * // Basic text input
 * <Input
 *   label="Player Name"
 *   value={playerName}
 *   onChangeText={setPlayerName}
 *   placeholder="Enter your name"
 * />
 *
 * // Input with error
 * <Input
 *   label="Handicap"
 *   value={handicap}
 *   onChangeText={setHandicap}
 *   keyboardType="numeric"
 *   error={handicapError}
 * />
 *
 * // Multiline input
 * <Input
 *   label="Notes"
 *   value={notes}
 *   onChangeText={setNotes}
 *   placeholder="Add notes about this round..."
 *   multiline
 *   numberOfLines={4}
 * />
 *
 * // Password input
 * <Input
 *   label="Password"
 *   value={password}
 *   onChangeText={setPassword}
 *   placeholder="Enter password"
 *   secureTextEntry
 * />
 *
 * // Email input
 * <Input
 *   label="Email"
 *   value={email}
 *   onChangeText={setEmail}
 *   placeholder="you@example.com"
 *   keyboardType="email-address"
 *   autoCapitalize="none"
 * />
 */
