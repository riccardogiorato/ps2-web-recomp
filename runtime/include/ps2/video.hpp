#pragma once
#include <cstdint>

namespace ps2 {
// Display-only options, independent of emulated GS state and save states.
// bit 0: edge AA; bits 1-2: output filter (original/smooth/nearest);
// bits 3-4: deinterlace (blend/current/adaptive); bits 8-14: sharpness 0-100.
void set_video_options(std::uint32_t options);
std::uint32_t video_options();
}
