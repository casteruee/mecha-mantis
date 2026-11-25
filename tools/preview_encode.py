from pathlib import Path
import sys
import av
from PIL import Image, ImageDraw, ImageFont
frames,fps,dest=sys.argv[1:]
with av.open(dest,'w',options={'movflags':'+faststart'}) as out:
    stream=out.add_stream('libx264',rate=int(fps))
    stream.width,stream.height=1080,1920
    stream.pix_fmt='yuv420p'
    stream.options={'crf':'16','preset':'veryfast'}
    stream.thread_count=3
    title=Image.open(Path(__file__).with_name('title.png')).convert('RGBA')
    for index,path in enumerate(sorted(Path(frames).glob('f*.jpg'))):
        with Image.open(path) as im:
            frame=im.convert('RGB')
            t=index/int(fps)
            if 1.63<t<2.9:
                alpha=int(255*min(1,(t-1.63)/.24,(2.9-t)/.12))
                label=ImageDraw.Draw(frame,'RGBA')
                label.rectangle((82,1527,138,1533), fill=(226,16,120,alpha))
                frame.paste(title,(78,1545),title.getchannel('A').point(lambda v:v*alpha//255))
            video_frame=av.VideoFrame.from_image(frame).reformat(format='yuv420p')
            out.mux(stream.encode(video_frame))
    out.mux(stream.encode(None))

