// 이미지와 영상 파일을 불러오고, 영상은 내보내기용으로 정확한 시각으로 이동시키는 도우미

// 긴 변이 max보다 크면 줄이는 비율(최대 1)을 돌려준다.
export function fitScale(w: number, h: number, max: number): number {
  const longest = Math.max(w, h);
  return longest > max ? max / longest : 1;
}

// 큰 이미지는 불러올 때 한 번만 줄인다. 매 프레임 큰 원본을 그리면 미리보기가 무거워지고 내보내기도 느려진다.
export function loadImage(file: File, maxSide = 1600): Promise<CanvasImageSource> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = fitScale(img.naturalWidth, img.naturalHeight, maxSide);
      if (k >= 1) {
        resolve(img);
        return;
      }
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = c.getContext("2d");
      if (!ctx) {
        resolve(img);
        return;
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다."));
    };
    img.src = url;
  });
}

export function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("영상을 읽을 수 없습니다."));
    v.src = URL.createObjectURL(file);
  });
}

// 영상 길이보다 긴 구간은 처음부터 반복한다. 미리보기의 loop와 같은 규칙이다.
export function seekVideo(v: HTMLVideoElement, t: number): Promise<void> {
  const dur = v.duration || 1;
  const target = t % dur;
  if (Math.abs(v.currentTime - target) < 0.001) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done);
    v.currentTime = target;
  });
}
