import { director, Director } from "cc";
import { GameShell } from "./GameShell";
import { refreshDesignResolution } from "./core/DesignMetrics";
import { applyPhoneViewport, watchPhoneViewport } from "./core/PhoneViewport";

/**
 * 场景挂载方式:工程只维护一个 Main.scene(内置组件),所有游戏节点由代码构建。
 * 自定义组件在 scene JSON 里以压缩 uuid 引用、无法可靠手写,因此壳层在场景启动后
 * 运行时 addComponent,场景文件与脚本解耦,重命名/移动脚本都不会破坏场景。
 */
let viewportWatched = false;

function mount(): void {
    const scene = director.getScene();
    if (!scene) return;
    const canvas = scene.getChildByName("Canvas");
    if (!canvas) return;
    // 先收盒再算设计分辨率:refreshDesignResolution 读的就是这块盒的宽高比
    applyPhoneViewport();
    if (!viewportWatched) {
        watchPhoneViewport();
        viewportWatched = true;
    }
    refreshDesignResolution();
    if (canvas.getComponent(GameShell)) return;
    canvas.addComponent(GameShell);
}

director.on(Director.EVENT_AFTER_SCENE_LAUNCH, mount);
