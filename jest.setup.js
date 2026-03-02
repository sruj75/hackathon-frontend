jest.mock('react-native-reanimated', () => {
  try {
    const reanimatedMock = require('react-native-reanimated/mock');
    if (reanimatedMock?.default) {
      reanimatedMock.default.call = () => {};
    }
    return reanimatedMock;
  } catch {
    const React = require('react');
    const RN = require('react-native');
    const makeAnimatedComponent = (Component) =>
      React.forwardRef((props, ref) =>
        React.createElement(Component, { ...props, ref }, props.children)
      );

    return {
      __esModule: true,
      default: {
        View: makeAnimatedComponent(RN.View),
        Text: makeAnimatedComponent(RN.Text),
        Image: makeAnimatedComponent(RN.Image),
        ScrollView: makeAnimatedComponent(RN.ScrollView),
        FlatList: makeAnimatedComponent(RN.FlatList),
      },
      createAnimatedComponent: makeAnimatedComponent,
      useSharedValue: (value) => ({ value }),
      useDerivedValue: (updater) => ({ value: updater() }),
      useAnimatedStyle: (updater) => updater(),
      useAnimatedProps: (updater) => updater(),
      runOnJS: (fn) => fn,
      runOnUI: (fn) => fn,
      withTiming: (value) => value,
      withSpring: (value) => value,
      withDelay: (_delayMs, value) => value,
      cancelAnimation: () => undefined,
      setUpTests: () => undefined,
      LinearTransition: {},
      FadeIn: {},
      FadeOut: {},
      Layout: {
        springify: () => ({}),
      },
      Easing: {
        linear: () => 0,
      },
    };
  }
});

jest.mock('react-native-worklets', () => ({
  __esModule: true,
  createWorkletRuntime: () => ({}),
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  runOnUIAsync: (fn) => fn,
  runOnRuntime: (fn) => fn,
  scheduleOnUI: (fn, ...args) => fn(...args),
  scheduleOnRN: (fn, ...args) => fn(...args),
}));
