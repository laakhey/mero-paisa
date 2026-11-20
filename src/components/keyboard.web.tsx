import { ScrollView, type ScrollViewProps } from 'react-native';

/** Web: browsers keep the focused field in view themselves. */
export function useKeyboardScope(): null {
  return null;
}

export function FormScrollView(props: ScrollViewProps) {
  return <ScrollView {...props} />;
}
