export type ResolutionQuery = {
  addEventListener: (type: 'change', listener: () => void) => void;
  removeEventListener: (type: 'change', listener: () => void) => void;
};

export type WatchDevicePixelRatioOptions = {
  getDevicePixelRatio: () => number;
  matchMedia: (query: string) => ResolutionQuery;
  onChange: () => void;
};

export type DevicePixelRatioWatch = {
  dispose: () => void;
};

export function watchDevicePixelRatio(
  options: WatchDevicePixelRatioOptions,
): DevicePixelRatioWatch {
  let disposed = false;
  let query = options.matchMedia(
    resolutionQuery(options.getDevicePixelRatio()),
  );

  const onResolutionChange = (): void => {
    query.removeEventListener('change', onResolutionChange);
    if (disposed) {
      return;
    }

    options.onChange();
    query = options.matchMedia(resolutionQuery(options.getDevicePixelRatio()));
    query.addEventListener('change', onResolutionChange);
  };

  query.addEventListener('change', onResolutionChange);

  return {
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      query.removeEventListener('change', onResolutionChange);
    },
  };
}

function resolutionQuery(devicePixelRatio: number): string {
  return `(resolution: ${devicePixelRatio}dppx)`;
}
