const move_next =  document.getElementById("move_next");
const skin =  document.getElementById("skin");
const menu =  document.getElementById("menu");

move_next.addEventListener("click", function(){
    skin.style.display = "none";
    menu.style.display = "block";
});

const category = document.querySelectorAll(".categ-btn");
const option = document.querySelectorAll(".opt");

category.forEach(function(button){
    button.addEventListener("click", function(){

        option.forEach(function(box){
            box.style.display = "none";
        });

        category.forEach(function(b){
            b.classList.remove("categ-btn-act");
        });

        button.classList.add("categ_btn-act");

        const targetBox=button.getAttribute("target");

        document.getElementById(targetBox).style.display = "flex";
    });
});
