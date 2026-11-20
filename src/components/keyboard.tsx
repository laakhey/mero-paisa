import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import { Dimensions, Keyboard, ScrollView, View, type ScrollViewProps, type TextInput } from 'react-native';

import { space } from '@/theme/tokens';

/**
 * Keeps the focused field visible above the on-screen keyboard.
 *
 * Android apps are edge-to-edge, so the window no longer shrinks when the
 * keyboard opens, and iOS never shrinks it: without help, fields near the
 * bottom of a form end up under the keyboard. This is plain JavaScript on top
 * of React Native's own keyboard events, so it works in Expo Go as well as in
 * builds (a native keyboard library would not load in Expo Go).
 *
 * While the keyboard is open the scroll view gets matching empty space at the
 * bottom, so even the last field can scroll clear of it, and the focused field
 * is scrolled up just far enough to sit above the keyboard.
 */

type FieldRef = ComponentRef<typeof TextInput>;

type KeyboardScope = { fieldFocused: (field: FieldRef | null) => void };

const KeyboardScopeContext = createContext<KeyboardScope | null>(null);

/** For text fields inside a `FormScrollView`; null elsewhere. */
export function useKeyboardScope(): KeyboardScope | null {
  return use(KeyboardScopeContext);
}

/** Gap kept between the focused field and the top of the keyboard. */
const FIELD_GAP = space.xl;

export function FormScrollView({ children, onScroll, scrollEventThrottle, ...props }: ScrollViewProps) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const focusedField = useRef<FieldRef | null>(null);
  // Window y of the keyboard's top edge while it is open.
  const keyboardTop = useRef<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const reveal = useCallback(() => {
    const field = focusedField.current;
    const top = keyboardTop.current;
    // Only fields of this scroll view, and only while one is actually focused:
    // other screens stay mounted underneath and must not scroll.
    if (!field || top === null || !field.isFocused()) return;
    // Let the extra bottom space lay out first, so there is room to scroll into.
    requestAnimationFrame(() => {
      field.measureInWindow((_x, y, _width, height) => {
        const overlap = y + height + FIELD_GAP - top;
        if (overlap > 0) scrollRef.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
      });
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      const { height, screenY } = event.endCoordinates;
      keyboardTop.current = screenY > 0 ? screenY : Dimensions.get('window').height - height;
      setKeyboardHeight(height);
      reveal();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [reveal]);

  const scope = useMemo<KeyboardScope>(
    () => ({
      fieldFocused: (field) => {
        focusedField.current = field;
        // Moving between fields while the keyboard stays open fires no keyboard event.
        if (keyboardTop.current !== null) reveal();
      },
    }),
    [reveal]
  );

  return (
    <KeyboardScopeContext value={scope}>
      <ScrollView
        ref={scrollRef}
        {...props}
        scrollEventThrottle={scrollEventThrottle ?? 16}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}>
        {children}
        {keyboardHeight > 0 ? <View style={{ height: keyboardHeight }} /> : null}
      </ScrollView>
    </KeyboardScopeContext>
  );
}
