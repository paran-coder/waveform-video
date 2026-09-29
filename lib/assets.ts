// 이미지와 영상 파일을 불러오고, 영상은 내보내기용으로 정확한 시각으로 이동시키는 도우미

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    img.src = URL.createObjectURL(file);
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
