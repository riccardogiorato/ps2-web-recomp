// Headless pixel tests for the actual display shader, using wgpu-native.
#include <webgpu/webgpu.h>
#include <webgpu/wgpu.h>
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

extern const char kBlitShader[];
static WGPUStringView str(const char *s) { return {s, std::strlen(s)}; }
static void check(bool pass, const char *message) { if (!pass) { std::fprintf(stderr, "FAIL: %s\n", message); std::exit(1); } }
static void error(WGPUDevice const *, WGPUErrorType, WGPUStringView message, void *, void *) {
    std::fprintf(stderr, "WebGPU: %.*s\n", int(message.length), message.data); std::exit(1);
}

int main() {
    WGPUInstance instance = wgpuCreateInstance(nullptr);
    WGPUAdapter adapter = nullptr;
    WGPURequestAdapterOptions options = WGPU_REQUEST_ADAPTER_OPTIONS_INIT;
    WGPURequestAdapterCallbackInfo acb = WGPU_REQUEST_ADAPTER_CALLBACK_INFO_INIT;
    acb.mode = WGPUCallbackMode_AllowSpontaneous;
    acb.userdata1 = &adapter;
    acb.callback = [](WGPURequestAdapterStatus, WGPUAdapter value, WGPUStringView, void *out, void *) { *static_cast<WGPUAdapter *>(out) = value; };
    wgpuInstanceRequestAdapter(instance, &options, acb);
    check(adapter != nullptr, "headless GPU adapter available");
    WGPUDevice device = nullptr;
    WGPUDeviceDescriptor dd = WGPU_DEVICE_DESCRIPTOR_INIT;
    dd.uncapturedErrorCallbackInfo.callback = error;
    WGPURequestDeviceCallbackInfo dcb = WGPU_REQUEST_DEVICE_CALLBACK_INFO_INIT;
    dcb.mode = WGPUCallbackMode_AllowSpontaneous;
    dcb.userdata1 = &device;
    dcb.callback = [](WGPURequestDeviceStatus, WGPUDevice value, WGPUStringView, void *out, void *) { *static_cast<WGPUDevice *>(out) = value; };
    wgpuAdapterRequestDevice(adapter, &dd, dcb);
    check(device != nullptr, "headless device available");
    WGPUQueue queue = wgpuDeviceGetQueue(device);
    WGPUShaderSourceWGSL source = WGPU_SHADER_SOURCE_WGSL_INIT;
    source.code = str(kBlitShader);
    WGPUShaderModuleDescriptor md = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
    md.nextInChain = &source.chain;
    WGPUShaderModule shader = wgpuDeviceCreateShaderModule(device, &md);
    WGPUColorTargetState color = WGPU_COLOR_TARGET_STATE_INIT;
    color.format = WGPUTextureFormat_RGBA8Unorm;
    WGPUFragmentState fragment = WGPU_FRAGMENT_STATE_INIT;
    fragment.module = shader; fragment.entryPoint = str("fs"); fragment.targetCount = 1; fragment.targets = &color;
    WGPURenderPipelineDescriptor pd = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
    pd.vertex.module = shader; pd.vertex.entryPoint = str("vs"); pd.fragment = &fragment;
    WGPURenderPipeline pipeline = wgpuDeviceCreateRenderPipeline(device, &pd);
    check(pipeline != nullptr, "display shader compiles");

    auto buffer = [&](std::uint64_t size, WGPUBufferUsage usage) {
        WGPUBufferDescriptor desc = WGPU_BUFFER_DESCRIPTOR_INIT;
        desc.size = size; desc.usage = usage;
        return wgpuDeviceCreateBuffer(device, &desc);
    };
    constexpr unsigned input = 16, output = 64, plane = input * input;
    WGPUBuffer pixels = buffer(plane * 2 * 4, WGPUBufferUsage_Storage | WGPUBufferUsage_CopyDst);
    WGPUBuffer params = buffer(32, WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst);
    WGPUBuffer readback = buffer(output * output * 4, WGPUBufferUsage_MapRead | WGPUBufferUsage_CopyDst);
    WGPUBindGroupLayout layout = wgpuRenderPipelineGetBindGroupLayout(pipeline, 0);
    WGPUBindGroupEntry entries[2] = {WGPU_BIND_GROUP_ENTRY_INIT, WGPU_BIND_GROUP_ENTRY_INIT};
    entries[0].binding = 0; entries[0].buffer = pixels; entries[0].size = plane * 2 * 4;
    entries[1].binding = 1; entries[1].buffer = params; entries[1].size = 32;
    WGPUBindGroupDescriptor gd = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
    gd.layout = layout; gd.entryCount = 2; gd.entries = entries;
    WGPUBindGroup group = wgpuDeviceCreateBindGroup(device, &gd);
    WGPUTextureDescriptor td = WGPU_TEXTURE_DESCRIPTOR_INIT;
    td.size = {output, output, 1}; td.format = color.format;
    td.usage = WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_CopySrc;
    WGPUTexture texture = wgpuDeviceCreateTexture(device, &td);
    WGPUTextureView view = wgpuTextureCreateView(texture, nullptr);
    auto render = [&](const std::vector<std::uint32_t> &image, std::uint32_t flags, bool blend = false) {
        const std::uint32_t uniform[8] = {input, input, 0, plane, blend ? 1u : 0u, output, output, flags};
        wgpuQueueWriteBuffer(queue, pixels, 0, image.data(), image.size() * 4);
        wgpuQueueWriteBuffer(queue, params, 0, uniform, 32);
        WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device, nullptr);
        WGPURenderPassColorAttachment attachment = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
        attachment.view = view; attachment.loadOp = WGPULoadOp_Clear; attachment.storeOp = WGPUStoreOp_Store;
        WGPURenderPassDescriptor passDesc = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
        passDesc.colorAttachmentCount = 1; passDesc.colorAttachments = &attachment;
        WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(encoder, &passDesc);
        wgpuRenderPassEncoderSetPipeline(pass, pipeline); wgpuRenderPassEncoderSetBindGroup(pass, 0, group, 0, nullptr);
        wgpuRenderPassEncoderDraw(pass, 3, 1, 0, 0); wgpuRenderPassEncoderEnd(pass); wgpuRenderPassEncoderRelease(pass);
        WGPUTexelCopyTextureInfo from = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
        from.texture = texture;
        WGPUTexelCopyBufferInfo to = WGPU_TEXEL_COPY_BUFFER_INFO_INIT;
        to.buffer = readback; to.layout.bytesPerRow = output * 4; to.layout.rowsPerImage = output;
        const WGPUExtent3D extent{output, output, 1};
        wgpuCommandEncoderCopyTextureToBuffer(encoder, &from, &to, &extent);
        WGPUCommandBuffer commands = wgpuCommandEncoderFinish(encoder, nullptr);
        wgpuQueueSubmit(queue, 1, &commands);
        bool mapped = false;
        WGPUBufferMapCallbackInfo cb = WGPU_BUFFER_MAP_CALLBACK_INFO_INIT;
        cb.mode = WGPUCallbackMode_AllowSpontaneous; cb.userdata1 = &mapped;
        cb.callback = [](WGPUMapAsyncStatus status, WGPUStringView, void *out, void *) { check(status == WGPUMapAsyncStatus_Success, "readback succeeds"); *static_cast<bool *>(out) = true; };
        wgpuBufferMapAsync(readback, WGPUMapMode_Read, 0, output * output * 4, cb);
        wgpuDevicePoll(device, true, nullptr);
        check(mapped, "readback callback completed");
        std::vector<std::uint32_t> result(output * output);
        std::memcpy(result.data(), wgpuBufferGetConstMappedRange(readback, 0, result.size() * 4), result.size() * 4);
        wgpuBufferUnmap(readback); wgpuCommandBufferRelease(commands); wgpuCommandEncoderRelease(encoder);
        return result;
    };

    std::vector<std::uint32_t> image(plane * 2, 0xff808080);
    const auto flat = render(image, 0);
    check(std::all_of(flat.begin(), flat.end(), [](auto p) { return p == 0xff808080; }), "original flat color is preserved");
    for (unsigned filter = 0; filter < 3; ++filter)
        check(render(image, 1u | (filter << 1) | (40u << 8)) == flat, "AA and sharpening preserve flat colors for every filter");
    std::fill(image.begin(), image.begin() + plane, 0xffff0000); // blue (RGBA packed)
    std::fill(image.begin() + plane, image.end(), 0xff0000ff); // red
    const auto blend = render(image, 0, true);
    const auto red = blend[0] & 255u, blue = (blend[0] >> 16) & 255u;
    check(red >= 127 && red <= 128 && blue >= 127 && blue <= 128 && ((blend[0] >> 8) & 255u) == 0, "original field blending averages both fields");
    check(render(image, 1u << 3, true)[0] == 0xffff0000, "current field removes temporal ghosting");
    check(render(image, 2u << 3, true)[0] == 0xffff0000, "adaptive mode favors current field on motion");
    std::fill(image.begin(), image.end(), 0xff000000);
    for (unsigned y = 0; y < input; ++y) for (unsigned x = 0; x < input; ++x) image[y * input + x] = x > y ? 0xffffffff : 0xff000000;
    const auto original = render(image, 0), aa = render(image, 1);
    auto partial = [](const auto &pixels) { return std::count_if(pixels.begin(), pixels.end(), [](auto p) { const auto v = p & 255; return v > 0 && v < 255; }); };
    check(partial(aa) > partial(original), "edge AA creates subpixel coverage along diagonal edges");
    check(render(image, 2u << 1) != render(image, 1u << 1), "sharp-pixel and smooth output filters differ");
    const unsigned ramp[input] = {0, 0, 0, 8, 32, 96, 128, 136, 140, 142, 160, 224, 248, 255, 255, 255};
    for (unsigned y = 0; y < input; ++y) for (unsigned x = 0; x < input; ++x) {
        const unsigned v = ramp[x];
        image[y * input + x] = 0xff000000u | (v * 0x010101u);
    }
    check(render(image, 20u << 8) != render(image, 0), "mild sharpening changes soft gradient detail");
    std::puts("10 headless display shader checks passed");
    return 0;
}
