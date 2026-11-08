#!/usr/bin/env python3
# Writes Marea.xcodeproj for the iPad app. Run from the project root.
import hashlib, pathlib
def ID(s): return hashlib.md5(s.encode()).hexdigest()[:24].upper()
srcs = [("ios/main.mm","sourcecode.cpp.objcpp"),("src/engine.cpp","sourcecode.cpp.cpp"),("src/analysis.cpp","sourcecode.cpp.cpp"),("src/core.mm","sourcecode.cpp.objcpp"),("src/server.mm","sourcecode.cpp.objcpp"),("src/midi_input.mm","sourcecode.cpp.objcpp")]
res = [("ios/Assets.xcassets","folder.assetcatalog"),("web","folder"),("ios/PrivacyInfo.xcprivacy","text.xml")]
fws = ["AudioToolbox","AVFoundation","CoreAudio","CoreGraphics","CoreImage","CoreMIDI","Foundation","ImageIO","UIKit","WebKit"]
fr = []
bf = []
for p,t in srcs+res:
    name = p.split("/")[-1]
    fr.append(f'{ID("ref"+p)} = {{isa = PBXFileReference; lastKnownFileType = {t}; name = "{name}"; path = "{p}"; sourceTree = SOURCE_ROOT; }};')
    bf.append(f'{ID("bf"+p)} = {{isa = PBXBuildFile; fileRef = {ID("ref"+p)}; }};')
fr.append(f'{ID("refplist")} = {{isa = PBXFileReference; lastKnownFileType = text.plist.xml; name = Info.plist; path = ios/Info.plist; sourceTree = SOURCE_ROOT; }};')
fr.append(f'{ID("refapp")} = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = Marea.app; sourceTree = BUILT_PRODUCTS_DIR; }};')
for f in fws:
    fr.append(f'{ID("fw"+f)} = {{isa = PBXFileReference; lastKnownFileType = wrapper.framework; name = {f}.framework; path = System/Library/Frameworks/{f}.framework; sourceTree = SDKROOT; }};')
    bf.append(f'{ID("bfw"+f)} = {{isa = PBXBuildFile; fileRef = {ID("fw"+f)}; }};')
lst = lambda items: ", ".join(items)
settings = """ALWAYS_SEARCH_USER_PATHS = NO; ARCHS = arm64; ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; CLANG_CXX_LANGUAGE_STANDARD = "c++20"; CLANG_ENABLE_OBJC_ARC = YES; CODE_SIGN_STYLE = Automatic; DEVELOPMENT_TEAM = TEAMID; GCC_OPTIMIZATION_LEVEL = 3; GENERATE_INFOPLIST_FILE = NO; INFOPLIST_FILE = ios/Info.plist; IPHONEOS_DEPLOYMENT_TARGET = 15.0; PRODUCT_BUNDLE_IDENTIFIER = BUNDLEID; MARKETING_VERSION = MKTVER; CURRENT_PROJECT_VERSION = BUILDNUM; PRODUCT_NAME = Marea; SDKROOT = iphoneos; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = 2; ENABLE_BITCODE = NO; ENABLE_USER_SCRIPT_SANDBOXING = NO; OTHER_CPLUSPLUSFLAGS = "$(inherited) -Wno-deprecated-declarations -Wno-deprecated-anon-enum-enum-conversion";"""
pbx = f"""// !$*UTF8*$!
{{ archiveVersion = 1; classes = {{}}; objectVersion = 56; objects = {{
{chr(10).join(bf)}
{chr(10).join(fr)}
{ID("frameworks")} = {{isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = ({lst(ID("bfw"+f) for f in fws)}); runOnlyForDeploymentPostprocessing = 0; }};
{ID("sources")} = {{isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ({lst(ID("bf"+p) for p,_ in srcs)}); runOnlyForDeploymentPostprocessing = 0; }};
{ID("resources")} = {{isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = ({lst(ID("bf"+p) for p,_ in res)}); runOnlyForDeploymentPostprocessing = 0; }};
{ID("group")} = {{isa = PBXGroup; children = ({lst([ID("ref"+p) for p,_ in srcs+res]+[ID("refplist"),ID("refapp")]+[ID("fw"+f) for f in fws])}); sourceTree = "<group>"; }};
{ID("target")} = {{isa = PBXNativeTarget; buildConfigurationList = {ID("tcfg")}; buildPhases = ({ID("sources")}, {ID("frameworks")}, {ID("resources")}); buildRules = (); dependencies = (); name = Marea; productName = Marea; productReference = {ID("refapp")}; productType = "com.apple.product-type.application"; }};
{ID("project")} = {{isa = PBXProject; buildConfigurationList = {ID("pcfg")}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en, Base); mainGroup = {ID("group")}; productRefGroup = {ID("group")}; projectDirPath = ""; projectRoot = ""; targets = ({ID("target")}); }};
{ID("tdebug")} = {{isa = XCBuildConfiguration; buildSettings = {{ {settings} }}; name = Debug; }};
{ID("trel")} = {{isa = XCBuildConfiguration; buildSettings = {{ {settings} }}; name = Release; }};
{ID("pdebug")} = {{isa = XCBuildConfiguration; buildSettings = {{ SDKROOT = iphoneos; }}; name = Debug; }};
{ID("prel")} = {{isa = XCBuildConfiguration; buildSettings = {{ SDKROOT = iphoneos; }}; name = Release; }};
{ID("tcfg")} = {{isa = XCConfigurationList; buildConfigurations = ({ID("tdebug")}, {ID("trel")}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; }};
{ID("pcfg")} = {{isa = XCConfigurationList; buildConfigurations = ({ID("pdebug")}, {ID("prel")}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; }};
}}; rootObject = {ID("project")}; }}
"""
pathlib.Path("Marea.xcodeproj").mkdir(exist_ok=True)
# The Apple team that signs the iPad app comes from MAREA_TEAM or local.env, so it isn't stored in the repo.
import os
team = os.environ.get("MAREA_TEAM")
if not team and pathlib.Path("local.env").exists():
    for line in pathlib.Path("local.env").read_text().splitlines():
        if line.startswith("MAREA_TEAM="): team = line.split("=", 1)[1].strip()
if not team: raise SystemExit("Set MAREA_TEAM (your Apple team ID) in local.env or the environment.")
# Bundle ID from MAREA_BUNDLE / local.env, version and build number from ios/VERSION ("1.0 1").
bundle = os.environ.get("MAREA_BUNDLE")
if not bundle and pathlib.Path("local.env").exists():
    for line in pathlib.Path("local.env").read_text().splitlines():
        if line.startswith("MAREA_BUNDLE="): bundle = line.split("=", 1)[1].strip()
mkt, build = pathlib.Path("ios/VERSION").read_text().split()
pbx = pbx.replace("BUNDLEID", bundle or "com.francisco.marea").replace("MKTVER", mkt).replace("BUILDNUM", build)
pathlib.Path("Marea.xcodeproj/project.pbxproj").write_text(pbx.replace("TEAMID", team))
